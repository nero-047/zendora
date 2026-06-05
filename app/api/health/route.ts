export function GET() {
  return Response.json({
    ok: true,
    service: "zendora",
    timestamp: new Date().toISOString(),
  });
}
