/**
 * Imagen Open Graph 1200x630 generada en build a partir de la foto del hero de escritorio:
 * foto del box, velo oscuro, wordmark y el H1 en Big Shoulders. Si cambia hero-desktop.jpg,
 * la imagen se regenera sola en el siguiente despliegue.
 */
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const prerender = true;

const W = 1200;
const H = 630;

// Se genera en build (prerender), con el directorio del proyecto como cwd.
const root = (p: string) => join(process.cwd(), p);

async function text(markup: string, font: string, fontfile: string, width: number) {
  return sharp({
    text: { text: markup, font, fontfile, width, rgba: true, dpi: 72, wrap: 'word' },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
}

export const GET: APIRoute = async () => {
  const photo = await readFile(root('src/assets/photos/hero-desktop.jpg'));
  const wordmarkFont = root('src/og/RWODDisplay.ttf');
  const headlineFont = root('src/og/RWODShoulders.ttf');
  const textFont = root('src/og/RWODText.ttf');

  // Foto a sangre, centrada.
  const base = await sharp(photo)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .modulate({ saturation: 0.95 })
    .toBuffer();

  const veil = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0A0A0A" stop-opacity=".6"/>
          <stop offset=".35" stop-color="#0A0A0A" stop-opacity=".45"/>
          <stop offset=".65" stop-color="#0A0A0A" stop-opacity=".75"/>
          <stop offset="1" stop-color="#0A0A0A" stop-opacity=".96"/>
        </linearGradient>
        <linearGradient id="h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#0A0A0A" stop-opacity=".55"/>
          <stop offset=".65" stop-color="#0A0A0A" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#v)"/>
      <rect width="100%" height="100%" fill="url(#h)"/>
    </svg>`,
  );

  // Si el entorno de build no pudiera renderizar texto con sharp, se genera la imagen sin texto
  // (foto + velo) en lugar de romper el despliegue.
  let layers: { input: Buffer; top: number; left: number }[] = [{ input: veil, top: 0, left: 0 }];
  try {
    const wordmark = await text(
      '<span foreground="#F5F5F2">Rehability</span><span foreground="#34D399">WOD</span>',
      'RWODDisplay 34',
      wordmarkFont,
      600,
    );
    const headline = await text(
      '<span foreground="#F5F5F2">RECUPÉRATE\n</span><span foreground="#34D399">SIN DEJAR DE ENTRENAR.</span>',
      'RWODShoulders 128',
      headlineFont,
      1080,
    );
    const tagline = await text(
      '<span foreground="#C7CCD3" letter_spacing="2600">FISIOTERAPIA ONLINE PARA ATLETAS DE CROSSFIT</span>',
      'RWODText 17',
      textFont,
      1000,
    );

    const x = 64;
    const taglineTop = H - 58 - tagline.info.height;
    const headlineTop = taglineTop - 26 - headline.info.height;
    layers = [
      { input: veil, top: 0, left: 0 },
      { input: wordmark.data, top: 56, left: x },
      { input: headline.data, top: headlineTop, left: x },
      { input: tagline.data, top: taglineTop, left: x },
    ];
  } catch (error) {
    console.warn('[og] No se pudo renderizar el texto; og.jpg sin texto.', error);
  }

  const jpg = await sharp(base)
    .composite(layers)
    .jpeg({ quality: 84, mozjpeg: true, progressive: true })
    .toBuffer();

  return new Response(new Uint8Array(jpg), {
    headers: { 'content-type': 'image/jpeg' },
  });
};
