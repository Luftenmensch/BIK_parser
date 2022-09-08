import fetch from "node-fetch";
import * as util from "util";
import * as fs from "fs";
import AdmZip from "adm-zip";
import iconv from "iconv-lite";

const streamPipeline = util.promisify(require("stream").pipeline);

const getBICArchive = async () => {
  const res = await fetch("https://www.cbr.ru/s/newbik");

  await streamPipeline(res.body, fs.createWriteStream("./archive.zip"));
};

const unzipBICFile = async () => {
  const zip = new AdmZip("./archive.zip");

  zip.extractAllTo("./", true);
};

const findAttributeValue = (target: string, aName: string) => {
  const re = new RegExp(`(?<=${aName}=\").+?(?=\")`, "gmi");

  return target.match(re) ?? [];
};

const findBICValue = (entry: string) => {
  const bic = findAttributeValue(entry, " BIC")?.[0];

  if (!bic) {
    throw new Error("Can't find BIC value");
  }

  return Number(bic);
};

const findBankName = (entry: string) => {
  const name = findAttributeValue(entry, " NameP")?.[0];

  if (!name) {
    throw new Error("Can't find NameP value");
  }

  return name;
};

const findAccounts = (entry: string) => {
  return findAttributeValue(entry, " Account") as [];
};

const clearDir = async (fileNames: string[]) => {
  for (const name of fileNames) {
    console.log(`Deleting ${name}`);

    await fs.promises.unlink(name);
  }
};

const main = async () => {
  try {
    await getBICArchive(); //wait for fresh archive

    await unzipBICFile(); //wait to unzip and extract it

    const targetFile = (await fs.promises.readdir("./")).find((f) =>
      f.endsWith("xml")
    );

    if (!targetFile) throw new Error("Can't find target xml file");

    let xmlFileBuffer = await fs.promises.readFile(targetFile);

    const xmlDoc = iconv.decode(xmlFileBuffer, "windows-1251");

    const entries = xmlDoc.match(
      /<BICDirectoryEntry.+?(?=<\/BICDirectoryEntry>)/gi
    );

    if (!entries) {
      throw new Error(`Entries not found`);
    }

    const objectsToWrite: DbObject[] = [];

    for (const entry of entries) {
      const bic = findBICValue(entry);
      const accounts = findAccounts(entry);
      const name = findBankName(entry);

      if (accounts.length !== 0) {
        accounts.forEach((corrAccount) =>
          objectsToWrite.push({ name, bic, corrAccount })
        );
      }
    }

    console.log(objectsToWrite);

    return objectsToWrite;
  } catch (e) {
    console.error(e);
  }
};

main().finally(async () => {
  let files = await fs.promises.readdir("./");

  files = files.filter((f) => f.endsWith("xml") || f.endsWith("zip"));

  console.log(`Clearing directory`);
  await clearDir(files);
  console.log(`Directory cleared`);
});
