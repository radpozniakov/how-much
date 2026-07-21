import { useRef, useState } from 'react'
import type { FC } from 'react'
import styles from './ShareLink.module.css'

export interface ShareLinkProps {
  code: string
}

export const ShareLink: FC<ShareLinkProps> = ({ code }) => {
  const url = `${window.location.origin}/room/${code}`
  const inputRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else if (inputRef.current) {
        inputRef.current.select()
        // Deliberate fallback: navigator.clipboard is undefined in non-secure
        // contexts (e.g. http://<lan-ip>:5173), so execCommand is the only copy
        // path there. Deprecated but still the pragmatic choice for the demo.
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        document.execCommand('copy')
      }
      setCopied(true)
    } catch {
      // The link stays visible and selectable, so copy failure is non-fatal.
    }
  }

  return (
    <div className={styles.share}>
      <input
        ref={inputRef}
        className={styles.link}
        value={url}
        readOnly
        onFocus={(e) => e.target.select()}
      />
      <button type="button" onClick={copy}>
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  )
}
