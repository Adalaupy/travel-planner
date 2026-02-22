export function useIsDevelop(): boolean {
  if (typeof window !== 'undefined') {
    const env = process.env.NEXT_PUBLIC_IS_DEVELOP
    return env === 'true' || env === '1'
  }
  return process.env.NEXT_PUBLIC_IS_DEVELOP === 'true' || process.env.NEXT_PUBLIC_IS_DEVELOP === '1'
}

export default useIsDevelop
