import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

/** Authored 1.25px hand-inked crest for FERRUM Interactive Cinema (Prelude & Brand mark). */
export function FerrumEmblemIcon({ size = 28, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={Math.round(size * 1.45)}
      viewBox="0 0 32 46"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      {/* Outer architectural diamond/stanchion */}
      <path
        d="M16 2L27 11.5V34.5L16 44L5 34.5V11.5L16 2Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {/* Inner central iron spine & hairline barb */}
      <path d="M16 6V40" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M9 17H23M11.5 23H20.5M9 29H23" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="16" cy="23" r="2.2" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}

export function PlayIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4.5 3.2L12.8 8L4.5 12.8V3.2Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PauseIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M5.25 3.5V12.5M10.75 3.5V12.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

export function ArrowDownIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 2.75V13.25M8 13.25L3.75 9M8 13.25L12.25 9"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ArrowRightIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2.75 8H13.25M13.25 8L9 3.75M13.25 8L9 12.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CloseIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3.75 3.75L12.25 12.25M12.25 3.75L3.75 12.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SlidersIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2.5 5H13.5M2.5 11H13.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <circle cx="5.75" cy="5" r="1.65" fill="var(--ink, #0c0d0f)" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="10.25" cy="11" r="1.65" fill="var(--ink, #0c0d0f)" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}

export function MenuIndexIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2.5 4.25H13.5M2.5 8H10.5M2.5 11.75H13.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SoundWaveIcon({ size = 14, muted = false, ...props }: IconProps & { muted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2.5 6.25H5.2L8.75 3.25V12.75L5.2 9.75H2.5V6.25Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {muted ? (
        <path d="M11 6L14 10M14 6L11 10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      ) : (
        <path
          d="M11.2 5.4C12.1 6.3 12.6 7.1 12.6 8C12.6 8.9 12.1 9.7 11.2 10.6"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}
