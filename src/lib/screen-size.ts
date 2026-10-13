import { getViewports } from './devices';

export const DevicePixelRatioOptions: string[] = ['profile', '1', '1.25', '1.5', '1.75', '2', '2.5', '2.625', '2.75', '2.8125', '3', '3.5'];

export const ScreenSizePresets: string[] = [
  '1024x768',
  '1280x720',
  '1280x800',
  '1280x1024',
  '1366x768',
  '1440x900',
  '1536x864',
  '1600x900',
  '1680x1050',
  '1920x1080',
  '1920x1200',
  '2560x1440',
  '2560x1600',
  '3024x1964',
  '3440x1440',
  '3456x2234',
  '3840x2160',
  '4096x2304',
  '5120x2880',
];

export function getCompatibleProfileScreenSizes(profile: any): string[] {
  if (!profile || !profile.osId) return ScreenSizePresets;

  if (profile.osId.startsWith('and') || profile.osId.startsWith('ios')) {
    let hardware = profile.screen && profile.screen.width >= 600 ? 'tablet' : 'mobile';
    return getViewports(hardware, profile.osId);
  }

  if (profile.osId.startsWith('mac')) {
    return ['1440x900', '1680x1050', '1920x1080', '2560x1440', '2560x1600', '3024x1964', '3456x2234', '4096x2304', '5120x2880'];
  }

  return ['1366x768', '1440x900', '1536x864', '1600x900', '1680x1050', '1920x1080', '1920x1200', '2560x1440', '2560x1600', '3440x1440', '3840x2160'];
}

export function isCompatibleProfileScreenSize(profile: any, value: string): boolean {
  return getCompatibleProfileScreenSizes(profile).includes(value);
}

export function getRandomCompatibleProfileScreenSize(profile: any, exclude: string = ''): string {
  let candidates = getCompatibleProfileScreenSizes(profile).filter(size => size !== exclude);
  if (!candidates.length) candidates = getCompatibleProfileScreenSizes(profile);

  return candidates[Math.floor(Math.random() * candidates.length)];
}
