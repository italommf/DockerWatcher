import React, { useRef, useEffect } from 'react'

export default function VideoBackground({ videoPath = '/background.mp4' }) {
  const videoRef = useRef(null)

  useEffect(() => {
    // Garantir que o vídeo toque
    if (videoRef.current) {
      videoRef.current.play().catch((error) => {
        console.warn('Erro ao reproduzir vídeo de background:', error)
      })
    }
  }, [])

  return (
    <>
      <video
        ref={videoRef}
        className="video-background"
        autoPlay
        loop
        muted
        playsInline
      >
        <source src={videoPath} type="video/mp4" />
        {/* Fallback caso o vídeo não carregue */}
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(-45deg, #3B82F6, #6366F1, #F59E0B, #F97316)',
          zIndex: 0,
        }} />
      </video>
      <div className="video-overlay" />
    </>
  )
}


