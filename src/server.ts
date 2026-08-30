import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { AppContext } from './context.js';
import { createRouter } from './api/routes.js';
import { createWebhooks } from './github/webhooks.js';

/** Webhook payloads are small; a tight limit blunts trivial DoS attempts. */
const WEBHOOK_BODY_LIMIT = '5mb';

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
          const message = error instanceof Error ? error.message : 'webhook processing failed';
          // Signature failures are the caller's fault and must never be
          // retried; anything else is ours, and GitHub should retry it.
          const isSignatureFailure = message.toLowerCase().includes('signature');
          res.status(isSignatureFailure ? 401 : 500).json({ error: message });
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
