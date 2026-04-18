export interface ThemeInfo {
  description: string
  id: string
  name: string
}

export const THEMES: ThemeInfo[] = [
  {description: '经典主题', id: 'w001', name: '玉兰'},
  {description: '优雅主题', id: 'w002', name: '牡丹'},
  {description: '简洁主题', id: 'w003', name: '雏菊'},
  {description: '童趣彩虹', id: 'w004', name: '向日葵'},
  {description: '波普艺术', id: 'w005', name: '罂粟'},
  {description: '学术报告', id: 'w006', name: '白百合'},
  {description: '数字浪潮', id: 'w007', name: '蓝鸢尾'},
  {description: 'gothic', id: 'w009', name: '黑玫瑰'},
  {description: '轻氧职场', id: 'w010', name: '铃兰'},
  {description: '极简双线', id: 'w011', name: '白茶'},
  {description: '若隐若现', id: 'w012', name: '绣球'},
  {description: '诗意简约', id: 'w013', name: '梅花'},
  {description: '横线信纸', id: 'w014', name: '勿忘我'},
  {description: '无名', id: 'w016', name: '海棠'},
  {description: '极客黑', id: 'w017', name: '黑郁金香'},
  {description: '图案背景', id: 'w018', name: '金盏花'},
  {description: '天秀鹰文', id: 'w019', name: '山茶'},
  {description: '自定义主题', id: 'w020', name: '茉莉'},
  {description: '左侧胶囊二级标题', id: 'w021', name: '朱槿'},
  {description: '柔和留白', id: 'w022', name: '月见草'},
  {description: '轻盈明快', id: 'w023', name: '樱花'},
]

export function findTheme(themeId: string): ThemeInfo | undefined {
  const id = String(themeId || '').trim().toLowerCase()
  return THEMES.find(theme => theme.id === id)
}

export function formatThemeLabel(theme: ThemeInfo): string {
  return `${theme.id} ${theme.name} - ${theme.description}`
}
