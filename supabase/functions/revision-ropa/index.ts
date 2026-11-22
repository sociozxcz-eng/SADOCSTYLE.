import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { createClient } from "npm:@supabase/supabase-js@2.87.1";

const issuer = "https://token.actions.githubusercontent.com";
const keys = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks"));
const workflow = "sociozxcz-eng/SADOCSTYLE./.github/workflows/revision-ropa.yml@refs/heads/main";
Deno.serve(async req => {
  if (req.method !== "POST") return new Response(null, {status:405});
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
    const {payload} = await jwtVerify(token, keys, {issuer, audience:"sadoc-revision-ropa", algorithms:["RS256"]});
    if (payload.repository_id !== "1463451875" || payload.workflow_ref !== workflow ||
        !["schedule","workflow_dispatch","push"].includes(String(payload.event_name))) throw Error();
  } catch { return new Response(null, {status:403}); }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json();
  let result;
  if (body.action === "list") {
    result = await db.from("clothing_listings").select("id").eq("status","pending").order("created_at").limit(20);
  } else if (typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id)) {
    if (body.action === "read") result = await db.from("clothing_listings").select("image,name,description").eq("id",body.id).eq("status","pending").maybeSingle();
    else if (["approved","rejected"].includes(body.decision)) result = await db.from("clothing_listings").update({status:body.decision}).eq("id",body.id).eq("status","pending");
  }
  if (!result) return new Response(null,{status:400});
  if (result.error) return new Response(null,{status:503});
  return Response.json(result.data);
});
