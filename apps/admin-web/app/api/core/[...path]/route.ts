import { NextRequest, NextResponse } from "next/server";

function getInternalCoreApiBaseUrl(): string {
  const raw = (process.env.CORE_API_INTERNAL_URL ?? "").trim();
  if (!raw) {
    throw new Error("CORE_API_INTERNAL_URL is not set");
  }
  return raw.replace(/\/$/, "");
}

function getOwnerAdminId(): string {
  const raw = (process.env.OWNER_ADMIN_ID ?? "").trim();
  if (!raw) {
    throw new Error("OWNER_ADMIN_ID is not set");
  }
  return raw;
}

function buildUpstreamUrl(req: NextRequest, pathParts: string[]): string {
  const base = getInternalCoreApiBaseUrl();
  const upstreamPath = `/${pathParts.map(encodeURIComponent).join("/")}`;
  const url = new URL(`${base}${upstreamPath}`);
  const search = req.nextUrl.search;
  if (search) url.search = search.startsWith("?") ? search.slice(1) : search;
  return url.toString();
}

async function proxy(req: NextRequest, ctx: { params: { path: string[] } }): Promise<NextResponse> {
  const upstreamUrl = buildUpstreamUrl(req, ctx.params.path ?? []);
  const ownerAdminId = getOwnerAdminId();

  const headers = new Headers(req.headers);
  headers.set("x-owner-admin-id", ownerAdminId);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const contentType = headers.get("content-type") ?? "";
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? (contentType.includes("application/json") ? await req.text() : await req.arrayBuffer()) : undefined;

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body: body as any,
    redirect: "manual"
  });

  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete("set-cookie");
  resHeaders.delete("content-encoding");
  resHeaders.delete("transfer-encoding");

  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, { status: upstream.status, headers: resHeaders });
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }): Promise<NextResponse> {
  return proxy(req, ctx);
}
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }): Promise<NextResponse> {
  return proxy(req, ctx);
}
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }): Promise<NextResponse> {
  return proxy(req, ctx);
}
export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }): Promise<NextResponse> {
  return proxy(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }): Promise<NextResponse> {
  return proxy(req, ctx);
}
