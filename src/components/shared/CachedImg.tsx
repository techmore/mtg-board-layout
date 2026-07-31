import { useState, useEffect, useRef, type ImgHTMLAttributes } from 'react'
import { getCachedCardImage, cacheCardImage } from '../../services/cardImageCache'

interface CachedImgProps extends ImgHTMLAttributes<HTMLImageElement> {
  scryfallId?: string
}

export function CachedImg({ scryfallId, src, onError, ...imgProps }: CachedImgProps) {
  const [imgSrc, setImgSrc] = useState<string | undefined>(src)
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!scryfallId || !src) { setImgSrc(src); return }
    let cancelled = false

    getCachedCardImage(scryfallId).then((blob) => {
      if (cancelled) return
      if (blob) {
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        setImgSrc(url)
      } else {
        setImgSrc(src)
        if (src.startsWith('http')) {
          cacheCardImage(scryfallId, src)
        }
      }
    })

    return () => {
      cancelled = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [scryfallId, src])

  return <img src={imgSrc} onError={onError} {...imgProps} />
}
