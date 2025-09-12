import { useState, useEffect } from 'react'
import Head from 'next/head'
import FTPClient from '../components/FTPClient'

export default function Home() {
  const [isElectron, setIsElectron] = useState(false)

  useEffect(() => {
    // Check if we're running in Electron
    setIsElectron(typeof window !== 'undefined' && window.electronAPI)
  }, [])

  if (!isElectron) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Modern FTP Client</h1>
          <p className="text-gray-400">This application requires Electron to run properly.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Modern FTP Client</title>
        <meta name="description" content="A modern, intuitive FTP client" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <FTPClient />
    </>
  )
}
