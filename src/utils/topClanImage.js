import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

GlobalFonts.registerFromPath(
  path.join(process.cwd(), "src/fonts/minikstt.ttf"),
  "Montserrat"
);

const logo = await loadImage(
  path.join(process.cwd(), "src/utils/logo.png")
);

function getContrastText(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const luminance =
    0.2126 * r +
    0.7152 * g +
    0.0722 * b;

  return luminance > 0.55 ? "#000000" : "#FFFFFF";
}

export async function generateTopClanImage(topClan) {
  const WIDTH = 1920;
  const HEIGHT = 1080;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const bgColor = topClan.color;
  const textColor = getContrastText(bgColor);
  const initial = topClan.clan[0].toUpperCase();
  const clanName = topClan.clan.toUpperCase();

  const dateText = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).toUpperCase();

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

const logoWidth = 450;
const logoHeight = (logo.height / logo.width) * logoWidth;

ctx.globalAlpha = 0.9;
ctx.drawImage(
  logo,
  WIDTH / 2 - logoWidth / 2,
  40,
  logoWidth,
  logoHeight
);
ctx.globalAlpha = 1;

  ctx.globalAlpha = 0.20;
  ctx.fillStyle = textColor;
  ctx.font = "700 1500px Montserrat";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const m = ctx.measureText(initial);
  const bigY =
    HEIGHT / 2 +
    (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;

  ctx.fillText(initial, WIDTH / 2, bigY);
  ctx.globalAlpha = 1;

  const clanY = HEIGHT / 2 + 20;

  ctx.font = "300 280px Montserrat";
  ctx.fillStyle = textColor;
  ctx.textBaseline = "middle";
  ctx.fillText(clanName, WIDTH / 2, clanY);

  ctx.font = "300 110px Montserrat";
  ctx.fillText(
    "HAS DOMINATED THE LEADERBOARD TODAY",
    WIDTH / 2,
    clanY + 130
  );

  ctx.font = "300 160px Montserrat";
  ctx.fillText(dateText, WIDTH / 2, HEIGHT - 90);

  return canvas.toBuffer("image/png");
}


export async function buildTopClanImageFile(topClan) {
  const buffer = await generateTopClanImage(topClan);
  const outputPath = path.join(process.cwd(), "topclan.png");

  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}
