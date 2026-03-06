import type { AppProps } from 'next/app'
import Head from 'next/head'
import '../styles/globals.css'
import '../styles/components.module.css'
import Header from '../components/Header'
import { UsernameProvider } from '../context/UsernameContext'
import UsernameModal from '../components/UsernameModal'
import { useRouter } from "next/router";




export default function App({ Component, pageProps }: AppProps) {
    
    const router = useRouter();
    
    return (
        <UsernameProvider>
            <Head>                
                <link rel="icon" href={`${router.basePath}/favicon.ico`} />
            </Head>
            <UsernameModal />
            <Header />
            <Component {...pageProps} />
        </UsernameProvider>
    )
}
