import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_PERSON_TOKEN,
  EMAIL_PLACEHOLDER,
  IIN_PLACEHOLDER,
  PERSONNEL_PLACEHOLDER,
  PHONE_PLACEHOLDER,
  anonymize,
  anonymizeDetailed,
  deanonymize,
  detectImageType,
  personToken,
  prepareImages,
  stripImageMetadata,
  type AnonymizePerson,
} from "@/lib/ai/anonymize";

const people: AnonymizePerson[] = [
  { id: "p-1", fullName: "Кравцов Сергей Викторович", personnelNumber: "1001" },
  { id: "p-2", fullName: "Нурланов Ерлан Маратович", personnelNumber: "2002" },
  { id: "p-3", fullName: "Омарова Айгуль Сериковна", personnelNumber: "300345" },
];

describe("anonymize names", () => {
  it("replaces full names in both orders", () => {
    expect(anonymize("Наряд выдал Кравцов Сергей Викторович.", people)).toBe("Наряд выдал [И-1].");
    expect(anonymize("Ерлан Маратович Нурланов принял наряд", people)).toBe("[И-2] принял наряд");
  });

  it("replaces surname with initials in every common spelling", () => {
    expect(anonymize("Исполнитель: Нурланов Е.М.", people)).toBe("Исполнитель: [И-2]");
    expect(anonymize("Исполнитель: Нурланов Е. М.", people)).toBe("Исполнитель: [И-2]");
    expect(anonymize("Исполнитель: Нурланов Е.", people)).toBe("Исполнитель: [И-2]");
    expect(anonymize("Исполнитель: Е.М. Нурланов", people)).toBe("Исполнитель: [И-2]");
    expect(anonymize("Исполнитель: Е. Нурланов", people)).toBe("Исполнитель: [И-2]");
  });

  it("replaces surname with given name and given name with patronymic", () => {
    expect(anonymize("Нурланов Ерлан ушёл на обед", people)).toBe("[И-2] ушёл на обед");
    expect(anonymize("Сергей Кравцов на смене", people)).toBe("[И-1] на смене");
    expect(anonymize("Айгуль Сериковна согласовала", people)).toBe("[И-3] согласовала");
  });

  it("handles declension of surnames and given names", () => {
    expect(anonymize("Передать Кравцову Сергею", people)).toBe("Передать [И-1]");
    expect(anonymize("Согласовано с Омаровой", people)).toBe("Согласовано с [И-3]");
    expect(anonymize("Наряд Нурланова закрыт", people)).toBe("Наряд [И-2] закрыт");
    expect(anonymize("Позвонить Айгуль", people)).toBe("Позвонить [И-3]");
  });

  it("replaces standalone surnames and unique given names", () => {
    expect(anonymize("Кравцов проверил, Ерлан подтвердил", people)).toBe(
      "[И-1] проверил, [И-2] подтвердил",
    );
  });

  it("ignores case for full forms and Kazakh letter variants", () => {
    expect(anonymize("кравцов сергей викторович", people)).toBe("[И-1]");
    const kazakh: AnonymizePerson[] = [{ id: "k", fullName: "Нұрланов Әлихан Серікұлы" }];
    expect(anonymize("Работу принял Нурланов Алихан Серикулы", kazakh)).toBe("Работу принял [И-1]");
  });

  it("treats ё and е as the same letter", () => {
    const list: AnonymizePerson[] = [{ id: "s", fullName: "Семёнов Пётр Ильич" }];
    expect(anonymize("Семенов Петр Ильич", list)).toBe("[И-1]");
  });

  it("does not touch lowercase common words that equal a standalone name", () => {
    const list: AnonymizePerson[] = [{ id: "x", fullName: "Слесарь Высотник" }];
    expect(anonymize("слесарь заменил подшипник", list)).toBe("слесарь заменил подшипник");
    expect(anonymize("Высотник Слесарь заменил", list)).toBe("[И-1] заменил");
  });

  it("does not match names inside longer words", () => {
    const list: AnonymizePerson[] = [{ id: "k", fullName: "Ким Олег" }];
    expect(anonymize("Кимберлит и Ким", list)).toBe("Кимберлит и [И-1]");
  });

  it("uses explicit refs when given", () => {
    const list: AnonymizePerson[] = [{ id: "a", fullName: "Беляев Андрей Николаевич", ref: 7 }];
    expect(anonymize("Беляев А.Н.", list)).toBe(personToken(7));
  });

  it("marks shared surnames and given names as ambiguous", () => {
    const list: AnonymizePerson[] = [
      { id: "a", fullName: "Ахметов Ерлан Серикович" },
      { id: "b", fullName: "Ахметов Данияр Серикович" },
      { id: "c", fullName: "Иванов Ерлан Петрович" },
    ];
    expect(anonymize("Ахметов Данияр", list)).toBe("[И-2]");
    expect(anonymize("Ахметов пришёл", list)).toBe(`${AMBIGUOUS_PERSON_TOKEN} пришёл`);
    expect(anonymize("Ерлан пришёл", list)).toBe(`${AMBIGUOUS_PERSON_TOKEN} пришёл`);
    expect(anonymize("Данияр пришёл", list)).toBe("[И-2] пришёл");
  });

  it("prefers the most specific form for relatives sharing a surname stem", () => {
    const list: AnonymizePerson[] = [
      { id: "m", fullName: "Ахметов Ерлан" },
      { id: "f", fullName: "Ахметова Айгерим" },
    ];
    expect(anonymize("Ахметова Айгерим и Ахметов Ерлан", list)).toBe("[И-2] и [И-1]");
  });

  it("returns the token map for later reverse lookup", () => {
    const result = anonymizeDetailed("Кравцов", people);
    expect(result.tokens.get("[И-1]")).toBe("p-1");
    expect(result.tokens.size).toBe(3);
  });

  it("is stable across calls", () => {
    const text = "Кравцов С.В. передал смену Нурланову";
    expect(anonymize(text, people)).toBe(anonymize(text, people));
  });

  it("works without a people list", () => {
    expect(anonymize("Без имён")).toBe("Без имён");
  });

  it("skips people with an empty name", () => {
    expect(anonymize("Текст", [{ id: "e", fullName: "   " }])).toBe("Текст");
  });

  it("handles double-barrelled surnames", () => {
    const list: AnonymizePerson[] = [{ id: "d", fullName: "Иванов-Петров Олег" }];
    expect(anonymize("Иванов-Петров О. на смене", list)).toBe("[И-1] на смене");
  });
});

describe("anonymize contacts and numbers", () => {
  it("strips phone numbers in Kazakhstan formats", () => {
    for (const phone of [
      "+7 701 123 45 67",
      "+77011234567",
      "8 (701) 123-45-67",
      "87011234567",
      "8-701-123-45-67",
    ]) {
      expect(anonymize(`Звонить ${phone} срочно`)).toBe(`Звонить ${PHONE_PLACEHOLDER} срочно`);
    }
    expect(anonymize("внутренний 123-45-67")).toBe(`внутренний ${PHONE_PLACEHOLDER}`);
  });

  it("keeps dates, quantities and inventory numbers", () => {
    expect(anonymize("2026-10-08 заменено 4 болта М16, INV-123-45-67")).toBe(
      "2026-10-08 заменено 4 болта М16, INV-123-45-67",
    );
  });

  it("strips personnel numbers with markers and maps known ones to the person", () => {
    expect(anonymize("таб. № 2002 выполнил", people)).toBe("[И-2] выполнил");
    expect(anonymize("Табельный номер: 9999", people)).toBe(PERSONNEL_PLACEHOLDER);
    expect(anonymize("ТН 1234 на объекте", people)).toBe(`${PERSONNEL_PLACEHOLDER} на объекте`);
  });

  it("replaces long known personnel numbers even without a marker", () => {
    expect(anonymize("Исполнитель 300345", people)).toBe("Исполнитель [И-3]");
    expect(anonymize("Заменено 1001 мм ленты", people)).toBe("Заменено 1001 мм ленты");
  });

  it("strips e-mails and IIN", () => {
    expect(anonymize("Пишите ivanov@kmin.kz, ИИН 880101300123")).toBe(
      `Пишите ${EMAIL_PLACEHOLDER}, ИИН ${IIN_PLACEHOLDER}`,
    );
  });
});

describe("deanonymize", () => {
  it("restores names for known tokens and leaves unknown ones", () => {
    expect(deanonymize("[И-1] и [И-9]", people)).toBe("Кравцов Сергей Викторович и [И-9]");
  });

  it("accepts a custom display formatter", () => {
    expect(deanonymize("Ответственный [И-2]", people, (person) => person.id)).toBe(
      "Ответственный p-2",
    );
  });

  it("round-trips anonymized text", () => {
    const anonymized = anonymize("Кравцов Сергей Викторович", people);
    expect(deanonymize(anonymized, people)).toBe("Кравцов Сергей Викторович");
  });
});

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = marker;
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

function buildJpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe0, Buffer.from("JFIF\0")),
    jpegSegment(0xe1, Buffer.from("Exif\0\0GPS-SECRET")),
    Buffer.from([0xff]),
    jpegSegment(0xfe, Buffer.from("comment-secret")),
    jpegSegment(0xdb, Buffer.alloc(5, 1)),
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x10, 0x20, 0xff, 0xd9]),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
}

function buildPng(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", Buffer.alloc(13, 1)),
    pngChunk("tEXt", Buffer.from("Author\0secret")),
    pngChunk("eXIf", Buffer.from("gps")),
    pngChunk("IDAT", Buffer.alloc(6, 2)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function webpChunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(type, 0, "latin1");
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

function buildWebp(): Buffer {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x0c | 0x10;
  const body = Buffer.concat([
    webpChunk("VP8X", vp8x),
    webpChunk("VP8 ", Buffer.alloc(7, 3)),
    webpChunk("EXIF", Buffer.from("gps-secret")),
    webpChunk("XMP ", Buffer.from("xmp")),
  ]);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

describe("stripImageMetadata", () => {
  it("drops EXIF and comments from JPEG while keeping image data", () => {
    const result = stripImageMetadata({
      mediaType: "image/jpeg",
      base64: buildJpeg().toString("base64"),
    });
    expect(result?.mediaType).toBe("image/jpeg");
    const bytes = Buffer.from(result?.base64 ?? "", "base64");
    expect(bytes.includes(Buffer.from("GPS-SECRET"))).toBe(false);
    expect(bytes.includes(Buffer.from("comment-secret"))).toBe(false);
    expect(bytes.includes(Buffer.from("JFIF"))).toBe(true);
    expect(bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
  });

  it("drops text and EXIF chunks from PNG", () => {
    const result = stripImageMetadata({
      mediaType: "image/png",
      base64: buildPng().toString("base64"),
    });
    const bytes = Buffer.from(result?.base64 ?? "", "base64");
    expect(bytes.includes(Buffer.from("secret"))).toBe(false);
    expect(bytes.includes(Buffer.from("IDAT"))).toBe(true);
    expect(bytes.includes(Buffer.from("IEND"))).toBe(true);
  });

  it("drops EXIF and XMP chunks from WebP and clears the header flags", () => {
    const result = stripImageMetadata({
      mediaType: "image/webp",
      base64: buildWebp().toString("base64"),
    });
    const bytes = Buffer.from(result?.base64 ?? "", "base64");
    expect(bytes.includes(Buffer.from("gps-secret"))).toBe(false);
    expect(bytes.includes(Buffer.from("XMP "))).toBe(false);
    expect(bytes.readUInt32LE(4)).toBe(bytes.length - 8);
    expect((bytes[20] ?? 0) & 0x0c).toBe(0);
    expect((bytes[20] ?? 0) & 0x10).toBe(0x10);
  });

  it("accepts data URLs and fixes a wrong declared media type", () => {
    const base64 = `data:image/webp;base64,${buildPng().toString("base64")}`;
    expect(stripImageMetadata({ mediaType: "image/webp", base64 })?.mediaType).toBe("image/png");
  });

  it("rejects non-images, malformed base64 and truncated files", () => {
    expect(
      stripImageMetadata({
        mediaType: "image/png",
        base64: Buffer.from("hello").toString("base64"),
      }),
    ).toBeNull();
    expect(stripImageMetadata({ mediaType: "image/png", base64: "%%%" })).toBeNull();
    expect(stripImageMetadata({ mediaType: "image/png", base64: "" })).toBeNull();
    expect(
      stripImageMetadata({
        mediaType: "image/jpeg",
        base64: buildJpeg().subarray(0, 12).toString("base64"),
      }),
    ).toBeNull();
    expect(
      stripImageMetadata({
        mediaType: "image/png",
        base64: buildPng().subarray(0, 30).toString("base64"),
      }),
    ).toBeNull();
  });

  it("detects image types from magic bytes", () => {
    expect(detectImageType(buildJpeg())).toBe("image/jpeg");
    expect(detectImageType(buildPng())).toBe("image/png");
    expect(detectImageType(buildWebp())).toBe("image/webp");
    expect(detectImageType(Buffer.from("GIF89a"))).toBeNull();
  });

  it("prepares a list of images and reports the first invalid one", () => {
    const good = { mediaType: "image/png" as const, base64: buildPng().toString("base64") };
    expect(prepareImages(undefined)).toEqual({ ok: true, images: [] });
    const prepared = prepareImages([good]);
    expect(prepared.ok && prepared.images).toHaveLength(1);
    expect(prepareImages([good, { mediaType: "image/png", base64: "bad" }])).toEqual({
      ok: false,
      index: 1,
    });
  });
});
