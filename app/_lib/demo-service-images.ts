// Original fictional service photos from seed.ts; no seed or database is executed.
const images: Record<string, string> = {
  "Corte de Cabelo":
    "https://utfs.io/f/0ddfbd26-a424-43a0-aaf3-c3f1dc6be6d1-1kgxo7.png",
  Barba: "https://utfs.io/f/e6bdffb6-24a9-455b-aba3-903c2c2b5bde-1jo6tu.png",
  Pézinho: "https://utfs.io/f/8a457cda-f768-411d-a737-cdb23ca6b9b5-b3pegf.png",
  Sobrancelha:
    "https://utfs.io/f/2118f76e-89e4-43e6-87c9-8f157500c333-b0ps0b.png",
  Massagem: "https://utfs.io/f/c4919193-a675-4c47-9f21-ebd86d1c8e6a-4oen2a.png",
  Hidratação:
    "https://utfs.io/f/8a457cda-f768-411d-a737-cdb23ca6b9b5-b3pegf.png",
};

export function demoServiceImage(name: string, fallback: string) {
  return Object.hasOwn(images, name) ? images[name] : fallback;
}
