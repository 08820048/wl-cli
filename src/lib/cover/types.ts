export interface CoverGenerationConfig {
  apiKey?: string
  endpoint?: string
  model?: string
  size?: string
}

export interface CoverGenerationInput extends CoverGenerationConfig {
  outputPath?: string
  prompt?: string
  style?: 'business' | 'editorial' | 'magazine' | 'minimal'
  summary?: string
  title: string
}

export interface CoverGenerationResult {
  model: string
  outputPath: string
  prompt: string
  sourceUrl: string
}

export interface CoverInspectionInput {
  explicitCoverImage?: string
  fileText?: string
  inputPath?: string
}

export interface CoverInspectionResult {
  source?: string
  status: 'article-meta' | 'body-first-image' | 'explicit' | 'missing'
  summary: string
  title: string
}
