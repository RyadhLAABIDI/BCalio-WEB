// src/utils/upload.ts
export async function uploadToCloudinary(file: File): Promise<string> {
  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  if (!cloud || !preset) {
    throw new Error('Missing Cloudinary env: VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET')
  }

  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', preset)
  // optional: fd.append('folder', 'bcallio')

  const url = `https://api.cloudinary.com/v1_1/${cloud}/auto/upload`
  const res = await fetch(url, { method: 'POST', body: fd })
  if (!res.ok) {
    const t = await res.text().catch(()=>'')
    throw new Error(`Cloudinary upload failed (${res.status}): ${t}`)
  }
  const json = await res.json()
  return json.secure_url as string
}
