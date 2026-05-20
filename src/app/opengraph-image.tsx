import { ImageResponse } from "next/og";

export const alt =
  "Valiroopam artwork showing figurative emergence through rotational perception";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  const artwork = new URL(
    "/artworks/Valiroopam.png",
    "https://anekaroopam.art",
  ).toString();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#f4f0e8",
          display: "flex",
        }}
      >
        <img
          src={artwork}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 46%",
          }}
        />
      </div>
    ),
    size,
  );
}
