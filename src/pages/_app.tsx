import type { AppProps } from 'next/app'
import '../styles/globals.css'
import '../styles/components.module.css'
import Header from '../components/Header'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Header />
      <Component {...pageProps} />
    </>
  )
}
