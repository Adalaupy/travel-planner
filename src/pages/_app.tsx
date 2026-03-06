import type { AppProps } from 'next/app'
import Head from 'next/head'
import '../styles/globals.css'
import '../styles/components.module.css'
import Header from '../components/Header'
import { UsernameProvider } from '../context/UsernameContext'
import UsernameModal from '../components/UsernameModal'

export default function App({ Component, pageProps }: AppProps) {
    return (
        <UsernameProvider>
            <Head>
                <link rel="icon" href="/favicon.ico" />
            </Head>
            <UsernameModal />
            <Header />
            <Component {...pageProps} />
        </UsernameProvider>
    )
}
