import React, { useEffect, useRef } from 'react'
const ParticleNet: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const raf = useRef<number>()
  const particles: {x:number,y:number,vx:number,vy:number}[] = []
  const max = 85, linkDist = 130

  useEffect(()=>{
    const c = canvasRef.current!, ctx = c.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio||1, 2)
    const resize = ()=>{ c.width = innerWidth*dpr; c.height = innerHeight*dpr; c.style.width = innerWidth+'px'; c.style.height = innerHeight+'px'; ctx.setTransform(dpr,0,0,dpr,0,0) }
    resize(); addEventListener('resize', resize)
    while(particles.length<max){ particles.push({ x:Math.random()*innerWidth, y:Math.random()*innerHeight, vx:(Math.random()*2-1)*0.6, vy:(Math.random()*2-1)*0.6 })}

    const getPrimary = () => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#6EC1E4'
    const loop = ()=>{
      const primary = getPrimary()
      ctx.clearRect(0,0,c.width,c.height)
      for(const p of particles){ p.x+=p.vx; p.y+=p.vy; if(p.x<0||p.x>innerWidth)p.vx*=-1; if(p.y<0||p.y>innerHeight)p.vy*=-1 }
      ctx.lineWidth=1
      for(let i=0;i<particles.length;i++){
        for(let j=i+1;j<particles.length;j++){
          const a=particles[i],b=particles[j]; const dx=a.x-b.x, dy=a.y-b.y; const d=Math.hypot(dx,dy)
          if(d<linkDist){ const alpha=1-d/linkDist; ctx.strokeStyle=`${hexToRgbA(primary, alpha*0.8)}`; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
        }
      }
      for(const p of particles){ ctx.fillStyle=primary; ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2); ctx.fill(); }
      raf.current = requestAnimationFrame(loop)
    }
    loop()
    return ()=>{ cancelAnimationFrame(raf.current!); removeEventListener('resize', resize) }
  },[])

  return <canvas ref={canvasRef} className="fixed inset-0 -z-10 opacity-70"></canvas>
}
function hexToRgbA(hex:string, a:number){ const s=hex.replace('#',''); const b=parseInt(s.length===3? s.split('').map(x=>x+x).join(''):s,16); const r=(b>>16)&255,g=(b>>8)&255,bl=b&255; return `rgba(${r},${g},${bl},${a})` }
export default ParticleNet
