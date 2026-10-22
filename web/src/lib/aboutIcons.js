import {
  Award,
  BookMarked,
  Briefcase,
  Globe2,
  GraduationCap,
  Heart,
  Mic,
  Newspaper,
  PenLine,
  School,
  Star,
  UsersRound,
} from 'lucide-react'

/** Icons an admin can pick for About Me cards (names match the API's list). */
export const ABOUT_ICONS = {
  school: School,
  newspaper: Newspaper,
  graduation: GraduationCap,
  book: BookMarked,
  pen: PenLine,
  award: Award,
  mic: Mic,
  heart: Heart,
  globe: Globe2,
  users: UsersRound,
  briefcase: Briefcase,
  star: Star,
}

export const aboutIcon = (name) => ABOUT_ICONS[name] || Star

/** Built-in photo ships with the website (WebP + JPG); uploaded photos are a single URL. */
export function photoSources(url) {
  if (url?.startsWith('/about/') && url.endsWith('.webp')) return { webp: url, fallback: url.replace(/\.webp$/, '.jpg') }
  return { webp: null, fallback: url }
}
