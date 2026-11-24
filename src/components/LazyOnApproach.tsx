import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'

/** Mounts lazy below-the-fold chunks only as user approaches, reserving height against CLS. */
export function LazyOnApproach({
  children,
  placeholderHeight = '320vh',
  margin = '150% 0px',
}: {
  children: ReactNode
  placeholderHeight?: string
  margin?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [show, setShow] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (show || !ref.current) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true)
          io.disconnect()
        }
      },
      { rootMargin: margin },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [show, margin])

  const placeholder = <div aria-hidden="true" style={{ height: placeholderHeight }} />
  if (!show) return <div ref={ref}>{placeholder}</div>
  return <Suspense fallback={placeholder}>{children}</Suspense>
}
