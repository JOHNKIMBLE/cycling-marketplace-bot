import http from 'node:http';

function renderHtml({ title, heading, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #111827; color: #f9fafb; margin: 0; padding: 32px; }
      main { max-width: 720px; margin: 0 auto; background: #1f2937; border-radius: 16px; padding: 24px; }
      h1 { margin-top: 0; }
      p, li { line-height: 1.5; }
      code { background: #111827; padding: 2px 6px; border-radius: 6px; }
      .muted { color: #9ca3af; }
    </style>
  </head>
  <body>
    <main>
      <h1>${heading}</h1>
      ${body}
      <p class="muted">You can return to Discord now.</p>
    </main>
  </body>
</html>`;
}

export class StravaOAuthServer {
  constructor({ stravaService, redirectUri, host, port }) {
    this.stravaService = stravaService;
    this.redirectUri = redirectUri;
    this.host = host;
    this.port = port;
    this.server = null;
  }

  start() {
    if (this.server) {
      return;
    }

    const redirectUrl = this.redirectUri ? new URL(this.redirectUri) : null;

    this.server = http.createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url, `http://${request.headers.host}`);

        if (request.method === 'GET' && requestUrl.pathname === '/health') {
          response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ ok: true }));
          return;
        }

        if (!redirectUrl || request.method !== 'GET' || requestUrl.pathname !== redirectUrl.pathname) {
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Not found');
          return;
        }

        const error = requestUrl.searchParams.get('error');
        const code = requestUrl.searchParams.get('code');
        const scope = requestUrl.searchParams.get('scope') || '';
        const stateId = requestUrl.searchParams.get('state');

        if (error) {
          response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(renderHtml({
            title: 'Strava connection failed',
            heading: 'Strava authorization failed',
            body: `<p>Strava returned <code>${error}</code>. Please go back to Discord and run <code>/strava connect</code> again.</p>`,
          }));
          return;
        }

        if (!code || !stateId) {
          response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(renderHtml({
            title: 'Invalid callback',
            heading: 'Missing Strava callback parameters',
            body: '<p>This callback did not include the required authorization code and state.</p>',
          }));
          return;
        }

        const completed = await this.stravaService.completeConnectSession({ stateId, code, scope });

        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(renderHtml({
          title: 'Strava connected',
          heading: 'Strava is now connected',
          body: [
            `<p><strong>${completed.guildName || completed.guildId}</strong> is now connected to Strava as <strong>${completed.athlete.firstname || ''} ${completed.athlete.lastname || ''}</strong>.</p>`,
            `<p>Granted scopes: <code>${(completed.scopes || []).join(', ') || 'none'}</code></p>`,
            `<p>Requested scopes: <code>${(completed.requestedScopes || []).join(', ') || 'none'}</code></p>`,
            completed.requestedScopes?.some((scopeName) => !completed.scopes?.includes(scopeName))
              ? '<p><strong>Warning:</strong> Strava did not grant every requested scope. If this keeps happening, confirm the container was restarted with the latest <code>STRAVA_OAUTH_SCOPES</code> value and run <code>/strava connect</code> again.</p>'
              : '',
          ].join(''),
        }));
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(renderHtml({
          title: 'Strava connection failed',
          heading: 'Strava connection failed',
          body: `<p>${error.message}</p>`,
        }));
      }
    });

    this.server.listen(this.port, this.host, () => {
      console.log(`Strava OAuth callback server listening on ${this.host}:${this.port}.`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
