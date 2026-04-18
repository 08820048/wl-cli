export type ComposeAction = 'copy' | 'draft' | 'export-html' | 'publish'
export type LayoutMode = 'minimal' | 'simple' | 'smart'
export type SourceMode = 'idea' | 'markdown-file' | 'url'

export interface ArticleSource {
  ideaPrompt?: string
  markdown: string
  mode: SourceMode
  sourceLabel: string
  title: string
  url?: string
}
