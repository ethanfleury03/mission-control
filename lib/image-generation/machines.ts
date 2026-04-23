import type { ImageTypeValue } from './types';

export const NO_MACHINE_VALUE = '__no_machine__';

export const IMAGE_TYPE_OPTIONS: Array<{ value: ImageTypeValue; label: string }> = [
  { value: 'linkedin_ad', label: 'LinkedIn Ad' },
  { value: 'youtube_thumbnail', label: 'YouTube Thumbnail' },
  { value: 'blog_image', label: 'Blog Image' },
];

export const IMAGE_TYPE_VARIANTS: Record<
  ImageTypeValue,
  { label: string; aspectIntent: string }
> = {
  linkedin_ad: {
    label: 'LinkedIn Ad',
    aspectIntent: 'Portrait-leaning social ad framing with space for campaign copy.',
  },
  youtube_thumbnail: {
    label: 'YouTube Thumbnail',
    aspectIntent: 'Wide, high-contrast framing that can support a title treatment.',
  },
  blog_image: {
    label: 'Blog Image',
    aspectIntent: 'Editorial feature framing that reads cleanly above an article.',
  },
};

export function getImageTypeLabel(value: ImageTypeValue): string {
  return IMAGE_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? 'Image';
}
