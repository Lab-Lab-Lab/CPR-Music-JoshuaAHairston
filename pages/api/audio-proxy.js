/**
 * Server-side audio proxy for S3-hosted media files.
 *
 * In production the Django backend stores media on S3 and returns pre-signed
 * S3 URLs.  Browser-side fetches (especially from Web Workers) fail because
 * the S3 bucket has no CORS policy for the frontend origin.  This route
 * fetches on the server (Cloudflare Worker / Node dev server) where CORS
 * does not apply and streams the result back same-origin.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  // Only allow known-safe destinations
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const allowed =
    parsed.hostname.endsWith('.amazonaws.com') ||
    parsed.hostname.endsWith('.musiccpr.org') ||
    parsed.hostname === 'localhost';
  if (!allowed) return res.status(403).json({ error: 'Domain not allowed' });

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).end();

    const arrayBuffer = await upstream.arrayBuffer();

    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'audio/mpeg',
    );
    res.setHeader('Content-Length', arrayBuffer.byteLength);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('audio-proxy: upstream fetch failed', err);
    res.status(502).json({ error: 'Upstream fetch failed' });
  }
}
