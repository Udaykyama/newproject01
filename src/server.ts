import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { AppContext } from './context.js';
import { createRouter } from './api/routes.js';
import { createWebhooks } from './github/webhooks.js';

/** Webhook payloads are small; a tight limit blunts trivial DoS attempts. */
const WEBHOOK_BODY_LIMIT = '5mb';

/**
 * Recover the HTTP status `@octokit/webhooks` attached to a rejection.
 *
 * Signature mismatches and unparseable payloads are tagged with `status: 400`
 * by the library and wrapped in an `AggregateError`. Reading that property is
 * stable across releases, unlike matching on the message text; anything with
 * no client-error status is our own bug and must be reported as a 500 so
 * GitHub retries the delivery.
 */
function clientErrorStatus(error: unknown): number | null {
  const candidates: unknown[] = [error];

  if (error instanceof AggregateError && Array.isArray(error.errors)) {
    candidates.push(...error.errors);
  }

  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const status = (candidate as { status?: unknown }).status;
    if (typeof status === 'number' && status >= 400 && status < 500) return status;
  }

  return null;
}

/**
 * Build the Express application.
 *
 * The webhook route reads the body as raw text because signature verification
 * must run over the exact bytes GitHub signed — re-serialising parsed JSON
 * would produce a different payload and fail verification.
 */
export function createServer(context: AppContext): Express {
  const app = express();

  app.disable('x-powered-by');

  if (context.config.webhookSecret) {
    const webhooks = createWebhooks(context);

    app.post(
      '/webhooks/github',
      express.text({ type: '*/*', limit: WEBHOOK_BODY_LIMIT }),
      async (req: Request, res: Response) => {
        const id = req.get('x-github-delivery');
        const name = req.get('x-github-event');
        const signature = req.get('x-hub-signature-256');

        if (!id || !name || !signature) {
          res.status(400).json({ error: 'missing GitHub webhook headers' });
          return;
        }

        try {
          await webhooks.verifyAndReceive({
            id,
            name: name as Parameters<typeof webhooks.verifyAndReceive>[0]['name'],
            signature,
            payload: typeof req.body === 'string' ? req.body : '',
          });
          res.status(202).json({ ok: true });
        } catch (error) {
          const status = clientErrorStatus(error);

          if (status !== null) {
            // The caller's fault, so GitHub must not retry it.
            res.status(status).json({ error: 'webhook rejected' });
            return;
          }

          console.error('[webhook] delivery failed:', error);
          res.status(500).json({ error: 'webhook processing failed' });
        }
      },
    );
  }

  app.use(createRouter(context));

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `no route for ${req.method} ${req.path}` });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[server] unhandled error:', error);
    // Never echo the internal message: it can carry file paths or SQL.
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}
