/**
 * Copies text to the clipboard, falling back to a hidden textarea for webviews
 * where the async Clipboard API is unavailable or blocked.
 */
export async function copyTextToClipboard(value: string): Promise<boolean> {
  if (!value) return false
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    // Fall through to the legacy copy path below.
  }

  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.append(input)
  input.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  } finally {
    input.remove()
  }
  return copied
}
