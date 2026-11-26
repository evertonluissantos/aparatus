import Image from "next/image";
import Link from "next/link";

interface BarbershopItemProps {
  barbershop: { id: string; name: string; address: string; imageUrl: string };
  href?: string;
}

const BarbershopItem = ({ barbershop, href }: BarbershopItemProps) => {
  return (
    <Link
      href={href ?? `/barbershops/${barbershop.id}`}
      prefetch={false}
      className="relative min-h-[200px] min-w-[290px] rounded-xl"
    >
      <div className="absolute top-0 left-0 z-10 h-full w-full rounded-lg bg-linear-to-t from-black to-transparent" />
      <Image
        src={barbershop.imageUrl}
        alt={barbershop.name}
        fill
        unoptimized={barbershop.imageUrl.startsWith("data:")}
        sizes="290px"
        className="rounded-xl object-cover"
      />
      <div className="absolute right-0 bottom-0 left-0 z-20 p-4">
        <h3 className="text-lg font-bold text-white">{barbershop.name}</h3>
        <p className="text-xs text-white/80">{barbershop.address}</p>
      </div>
    </Link>
  );
};

export default BarbershopItem;
