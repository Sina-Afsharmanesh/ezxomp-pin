import {
  checkForUpdate,
  getUpdateStatus,
  triggerUpdate,
  updateGuidance,
} from "@/server/update-service.ts"
import { verifyAuthToken } from "../../../lib/auth-guard";

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  // Defense-in-depth: verify auth token even though the proxy should catch it.
  const authError = verifyAuthToken(request);
  if (authError) return authError;
  try {
    const versionInfo = await checkForUpdate()
    const { status, error, targetVersion } = getUpdateStatus()

    return Response.json(
      {
        currentVersion: versionInfo.currentVersion,
        latestVersion: versionInfo.latestVersion,
        updateAvailable: versionInfo.updateAvailable,
        updateStatus: status,
        ...(error ? { error } : {}),
        ...(targetVersion ? { targetVersion } : {}),
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { error: message },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    )
  }
}

export async function POST(request: Request): Promise<Response> {
  // Defense-in-depth: verify auth token even though the proxy should catch it.
  const authError = verifyAuthToken(request);
  if (authError) return authError;
  try {
    const versionInfo = await checkForUpdate()

    // D6: no self-update in the OMP plugin — return guidance instead of
    // spawning `npm install -g`. 200 so the UI shows the message as info.
    return Response.json(
      {
        guidance: updateGuidance(versionInfo.latestVersion),
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { error: message },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    )
  }
}
