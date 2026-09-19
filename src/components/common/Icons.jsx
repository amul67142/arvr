/**
 * Hand-rolled line icons — a 20px grid at 1.25 stroke, which reads quieter
 * than any off-the-shelf set and keeps the bundle free of an icon dependency.
 */
const base = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

const Svg = ({ size = 16, children, ...rest }) => (
  <svg width={size} height={size} {...base} {...rest}>
    {children}
  </svg>
)

export const SunIcon = (props) => (
  <Svg {...props}>
    <circle cx="10" cy="10" r="3.4" />
    <path d="M10 2.2v1.6M10 16.2v1.6M17.8 10h-1.6M3.8 10H2.2M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1M15.5 15.5l-1.1-1.1M5.6 5.6L4.5 4.5" />
  </Svg>
)

export const MoonIcon = (props) => (
  <Svg {...props}>
    <path d="M16.2 12.3A6.8 6.8 0 0 1 7.7 3.8a6.9 6.9 0 1 0 8.5 8.5Z" />
  </Svg>
)

export const ResetIcon = (props) => (
  <Svg {...props}>
    <circle cx="10" cy="10" r="6.2" />
    <path d="M10 1.8v2.4M10 15.8v2.4M18.2 10h-2.4M4.2 10H1.8" />
    <circle cx="10" cy="10" r="1.2" />
  </Svg>
)

export const ExpandIcon = (props) => (
  <Svg {...props}>
    <path d="M7.4 2.6H2.6v4.8M12.6 2.6h4.8v4.8M17.4 12.6v4.8h-4.8M7.4 17.4H2.6v-4.8" />
  </Svg>
)

export const CollapseIcon = (props) => (
  <Svg {...props}>
    <path d="M2.6 7.4h4.8V2.6M17.4 7.4h-4.8V2.6M12.6 12.6h4.8v4.8M7.4 17.4v-4.8H2.6" />
  </Svg>
)

export const LayersIcon = (props) => (
  <Svg {...props}>
    <path d="M10 2.4 2.8 6.2 10 10l7.2-3.8L10 2.4Z" />
    <path d="M2.8 10.4 10 14.2l7.2-3.8M2.8 14.2 10 18l7.2-3.8" />
  </Svg>
)

export const UploadIcon = (props) => (
  <Svg {...props}>
    <path d="M10 13.2V3.4M6.4 6.8 10 3.2l3.6 3.6" />
    <path d="M3.2 12.6v2.6a1.6 1.6 0 0 0 1.6 1.6h10.4a1.6 1.6 0 0 0 1.6-1.6v-2.6" />
  </Svg>
)

export const CloseIcon = (props) => (
  <Svg {...props}>
    <path d="M5 5l10 10M15 5 5 15" />
  </Svg>
)

export const SearchIcon = (props) => (
  <Svg {...props}>
    <circle cx="8.8" cy="8.8" r="5.4" />
    <path d="m12.8 12.8 4 4" />
  </Svg>
)

export const ChevronIcon = (props) => (
  <Svg {...props}>
    <path d="m7.6 4.8 5 5.2-5 5.2" />
  </Svg>
)

export const ArrowIcon = (props) => (
  <Svg {...props}>
    <path d="M3.4 10h13.2M12 5.4l4.6 4.6-4.6 4.6" />
  </Svg>
)

export const CubeIcon = (props) => (
  <Svg {...props}>
    <path d="M10 2.2 3.2 6v8L10 17.8 16.8 14V6L10 2.2Z" />
    <path d="M3.2 6 10 9.8 16.8 6M10 9.8v8" />
  </Svg>
)

export const AlertIcon = (props) => (
  <Svg {...props}>
    <circle cx="10" cy="10" r="7.4" />
    <path d="M10 6v4.6M10 13.6v.6" />
  </Svg>
)
