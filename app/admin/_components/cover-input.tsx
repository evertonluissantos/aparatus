"use client";

import Image from "next/image";
import { useState, useRef } from "react";
import { Input } from "@/app/_components/ui/input";
import { Button } from "@/app/_components/ui/button";

export function CoverInput({
  value,
  onChange,
  onBusyChange,
  label = "Foto de capa",
  inputId = "shop-cover",
  optional = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onBusyChange: (busy: boolean) => void;
  label?: string;
  inputId?: string;
  optional?: boolean;
}) {
  const [error, setError] = useState("");
  const request = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  function choose(file: File | undefined) {
    const current = ++request.current;
    setError("");
    if (!file) {
      onBusyChange(false);
      return;
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024 ||
      file.size === 0
    ) {
      setError(
        "Selecione uma imagem JPG, PNG ou WebP de até 2 MB. A imagem anterior foi mantida.",
      );
      onBusyChange(false);
      return;
    }
    onBusyChange(true);
    const reader = new FileReader();
    const fail = () => {
      if (request.current === current) {
        setError(
          "Não foi possível abrir esta imagem. A imagem anterior foi mantida.",
        );
        onBusyChange(false);
      }
    };
    reader.onerror = fail;
    reader.onload = () => {
      if (typeof reader.result !== "string") return fail();
      const data = reader.result;
      // Decode locally before accepting the cover; no upload or remote URL.
      const preview = new window.Image();
      preview.onerror = fail;
      preview.onload = () => {
        if (request.current === current) {
          onChange(data);
          onBusyChange(false);
        }
      };
      preview.src = data;
    };
    reader.readAsDataURL(file);
  }
  return (
    <div className="space-y-3">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      {value ? (
        <div className="relative h-40 overflow-hidden rounded-xl">
          <Image
            src={value}
            alt={`Prévia: ${label}`}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, 600px"
            className="object-cover"
          />
        </div>
      ) : (
        <p className="bg-secondary text-muted-foreground rounded-xl p-5 text-sm">
          Nenhuma foto selecionada.
        </p>
      )}
      <Input
        ref={fileInput}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => choose(event.target.files?.[0])}
        aria-invalid={Boolean(error)}
        aria-describedby={`${inputId}-help ${inputId}-error`}
      />
      {optional && value && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            request.current++;
            if (fileInput.current) fileInput.current.value = "";
            onChange("");
            setError("");
            onBusyChange(false);
          }}
        >
          Remover foto
        </Button>
      )}
      <p id={`${inputId}-help`} className="text-muted-foreground text-xs">
        JPG, PNG ou WebP, até 2 MB. Sem envio de arquivo: a foto fica somente
        nesta aba.{" "}
        {optional
          ? "A foto é opcional."
          : "Se preferir, mantenha a capa ilustrativa."}
      </p>
      <p
        id={`${inputId}-error`}
        role="status"
        className="text-destructive text-sm"
      >
        {error}
      </p>
    </div>
  );
}
