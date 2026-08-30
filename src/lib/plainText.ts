/**
 * Open Library descriptions are markdown, and were being printed raw.
 *
 * A book page opened with '***A Game of Thrones*** is the inaugural novel in
 * ***A Song of Ice and Fire***' and had '###' headings scattered through the
 * middle of sentences. Rendering the markdown properly would mean shipping a
 * parser for one field; stripping the marks is the smaller honest answer, and
 * the text then reads the way whoever wrote it meant it to.
 */
export function plainText(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links, keeping the words
    .replace(/^#{1,6}\s*/gm, '') // headings at the start of a line
    .replace(/#{2,6}\s+/g, '') // and the ones buried mid-paragraph
    .replace(/[*_]{1,3}(?=\S)([^*_]+)[*_]{1,3}/g, '$1') // bold and italics
    .replace(/^>\s?/gm, '') // block quotes
    .replace(/`([^`]+)`/g, '$1') // code ticks
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
