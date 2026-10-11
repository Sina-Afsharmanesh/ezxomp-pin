import { collectSkillHealthData, resolveSkillHealthRoots } from "@/server/skill-health-service.ts"
import { requireProjectCwd } from "@/server/bridge/bridge-service.ts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  try {
    const projectCwd = requireProjectCwd(request)
    const [skillHealthPayload, roots] = await Promise.all([
      collectSkillHealthData(projectCwd),
      resolveSkillHealthRoots(projectCwd),
    ])
    return Response.json(
      {
        skillHealth: skillHealthPayload,
        skillHealthRoots: roots,
        resolutionMethod: "documented-compatibility-roots",
        rootInfo: roots.map((r) => ({
          method: r.method,
          exists: r.exists,
          root: r.root,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { error: message },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  }
}
