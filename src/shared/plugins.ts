import { z } from 'zod'

const text = z.string().trim().min(1, 'Required')
const id = text.regex(
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
  'Use lowercase letters, numbers, dots, hyphens or underscores'
)

export const pluginManifestSchema = z
  .object({
    name: id,
    version: text.optional(),
    description: z.string().optional(),
    author: z.string().optional(),
    languageServers: z
      .array(
        z.object({
          name: text,
          command: text,
          args: z.array(z.string()).optional(),
          exts: z
            .array(
              text
                .transform((ext) => ext.replace(/^\./, '').toLowerCase())
                .pipe(
                  z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'Enter a file extension, such as py')
                )
            )
            .min(1, 'Add at least one file extension')
        })
      )
      .optional(),
    agents: z.array(z.object({ id, name: text, command: text })).optional()
  })
  .superRefine((manifest, ctx) => {
    const ids = new Set<string>()
    manifest.agents?.forEach((agent, index) => {
      if (ids.has(agent.id))
        ctx.addIssue({
          code: 'custom',
          path: ['agents', index, 'id'],
          message: 'Agent IDs must be unique'
        })
      ids.add(agent.id)
    })
  })

export type PluginManifest = z.infer<typeof pluginManifestSchema>
export type PluginAgent = NonNullable<PluginManifest['agents']>[number]
export type Plugin = { dir: string; manifest: PluginManifest; enabled: boolean; error?: string }

export function parsePluginManifest(value: unknown): PluginManifest {
  const result = pluginManifestSchema.safeParse(value)
  if (!result.success)
    throw new Error(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')
    )
  return result.data
}
