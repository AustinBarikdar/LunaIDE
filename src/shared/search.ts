export type SearchMode = 'files' | 'text' | 'commands'
export type SearchRequest = {
  id: string
  project: string
  query: string
  openPaths: string[]
  buffers: { path: string; content: string }[]
  matchCase?: boolean
  wholeWord?: boolean
}
export type SearchResult = {
  path: string
  relativePath: string
  line?: number
  column?: number
  length?: number
  preview?: string
}
export type SearchResponse = {
  results: SearchResult[]
  truncated: boolean
  cancelled: boolean
}
