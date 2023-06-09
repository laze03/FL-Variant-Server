const express = require("express");
const PORT = 5000;
const fileUpload = require("express-fileupload");
const cors = require("cors");
const fs = require("fs");
const csv = require("csv-parser");
const puppeteer = require("puppeteer");
const { PDFDocument } = require("pdf-lib");

const app = express();
app.use(express.json());
app.use(cors());
app.use(fileUpload());

function vcfToCsv(filepaths, callback) {
  const csvFilePath = __dirname + "/uploads/output.csv";
  const csvContent = [];

  try {
    let processedFileCount = 0;

    for (const filepath of filepaths) {
      fs.readFile(filepath, "utf8", (err, data) => {
        if (err) {
          console.error("Error reading VCF file:", err);
          return callback(err);
        }

        const lines = data.trim().split("\n");

        for (const line of lines) {
          if (!line.startsWith("#")) {
            const fields = line.split("\t");
            const chrom = fields[0];
            const pos = fields[1];
            const ref = fields[3];
            let alt = fields[4];
            if (alt.includes(",")) {
              alt = alt.split(",")[0];
            }
            const info = fields[7].split("|");
            const type = info[1];
            const impact = info[2];
            const gene = info[3];
            csvContent.push([chrom, pos, ref, alt, type, impact, gene]);
          }
        }

        processedFileCount++;

        if (processedFileCount === filepaths.length) {
          finalizeCsvContent();
        }
      });
    }

    function finalizeCsvContent() {
      const header = ["CHROM", "POS", "REF", "ALT", "TYPE", "IMPACT", "GENE"];
      csvContent.unshift(header);

      const csvData = csvContent.map((row) => row.join(",")).join("\n");

      fs.writeFile(csvFilePath, csvData, "utf8", (err) => {
        if (err) {
          console.error("Error writing CSV file:", err);
          return callback(err);
        }

        console.log("CSV file generated successfully.");
        callback(null);
      });
    }
  } catch (err) {
    console.error("Error processing VCF files:", err);
    callback(err);
  }
}

app.post("/upload", async (req, res) => {
  const files = Array.isArray(req.files.files)
    ? req.files.files
    : [req.files.files];
  const filepaths = [];

  try {
    for (const file of files) {
      const filename = Date.now() + "_" + file.name;
      const uploadPath = __dirname + "/uploads/" + filename;
      await file.mv(uploadPath);
      filepaths.push(uploadPath);
    }

    vcfToCsv(filepaths, (err) => {
      if (err) {
        console.log("Error converting VCF to CSV:", err);
        return res.status(500).send("Error converting VCF to CSV.");
      }

      // Delete the VCF files
      filepaths.forEach((filepath) => {
        fs.unlink(filepath, (err) => {
          if (err) {
            console.log("Error deleting file:", err);
          } else {
            console.log("File deleted:", filepath);
          }
        });
      });

      console.log("Success");
      return res.status(200).send("Files uploaded and converted successfully.");
    });
  } catch (err) {
    console.log("Error uploading and converting files:", err);
    return res.status(500).send("Error uploading and converting files.");
  }
});

function getKeyOfMaxValue(obj) {
  let max = 0;
  let keyOfMax = "";
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (obj[key] > max) {
        max = obj[key];
        keyOfMax = key;
      }
    }
  }
  return keyOfMax;
}

// obj JSON_nombre_de_mutations_par_impact_par_gène
// listJson: Object.entries(JSON_nombree_de_mutations_par_impact_par_gène).map(([name, value]) => ({ name, value }))

function limit20Object(obj, listObj) {
  return new Promise((resolve, reject) => {
    let newList = [];
    let FINALlist = [];
    for (let i = 0; i < 20; i++) {
      const key = getKeyOfMaxValue(obj);
      newList.push(obj[key]);
      delete obj[key];
    }

    for (let i = 0; i < listObj.length; i++) {
      for (let j = 0; j < newList.length; j++) {
        if (newList[j] === listObj[i].value) {
          FINALlist.push(listObj[i]);
          delete listObj[i];
          break;
        }
        if (FINALlist.length === 20) {
          break;
        }
      }
    }

    resolve(FINALlist);
  });
}

//code1: pie
async function JSON_nombre_de_mutations_par_impact_par_gène() {
  return new Promise((resolve) => {
    const results = [];
    fs.createReadStream(__dirname + "/uploads/" + "output.csv")
      .pipe(csv({ delimiter: "," }))
      .on("data", (data) => results.push(data))
      .on("end", () => {
        // Compter le nombre de mutations par gène
        const geneMutationCounts = results.reduce((acc, row) => {
          const gene = row["GENE"];
          if (!acc[gene]) {
            acc[gene] = 0;
          }
          acc[gene]++;
          return acc;
        }, {});

        // Compter le nombre de gènes pour chaque nombre de mutations
        const mutationGeneCounts = Object.values(geneMutationCounts).reduce(
          (acc, count) => {
            if (!acc[count]) {
              acc[count] = 0;
            }
            acc[count]++;
            return acc;
          },
          {}
        );

        resolve(mutationGeneCounts);
      });
  });
}

async function test() {
  const obj = await JSON_nombre_de_mutations_par_impact_par_gène();
  const listObj = Object.entries(obj).map(([name, value]) => ({ name, value }));
  const result = await limit20Object(obj, listObj);
  return result;
}

test();
//code2: dans doc google bar, but u said pie is better w i agree with this

const JSON_distribution_impact_par_mutation = () => {
  return new Promise((resolve) => {
    const data = [];
    fs.createReadStream(__dirname + "/uploads/" + "output.csv")
      .pipe(csv())
      .on("data", (row) => {
        data.push(row);
      })
      .on("end", () => {
        const impactCounts = data.reduce((counts, row) => {
          const impact = row.IMPACT;
          counts[impact] = (counts[impact] || 0) + 1;
          return counts;
        }, {});

        resolve(impactCounts);
      });
  });
};

//code3:  bar

const JSON_distribution_des_gènes_par_chromosome = () => {
  return new Promise((resolve) => {
    const data = [];
    fs.createReadStream(__dirname + "/uploads/" + "output.csv")
      .pipe(csv())
      .on("data", (row) => {
        data.push(row);
      })
      .on("end", () => {
        const chromosomes = data.map((row) => row.CHROM);
        const genes = data.map((row) => row.NAME);

        const chromGeneCounts = {};
        for (let i = 0; i < chromosomes.length; i++) {
          const chromosome = chromosomes[i];
          const gene = genes[i];
          if (chromosome in chromGeneCounts) {
            chromGeneCounts[chromosome] += 1;
          } else {
            chromGeneCounts[chromosome] = 1;
          }
        }

        resolve(chromGeneCounts);
      });
  });
};

async function JSON_distribution_par_type_de_mutation() {
  return new Promise((resolve, reject) => {
    const data = [];
    fs.createReadStream(__dirname + "/uploads/" + "output.csv")
      .pipe(csv())
      .on("data", (row) => {
        data.push(row);
      })
      .on("end", () => {
        const counts = {};
        data.forEach((row) => {
          const types = row.TYPE.split("&"); // Sépare les types concaténés par "&"
          types.forEach((type) => {
            const trimmedType = type.trim(); // Supprime les espaces en début et fin de type
            const formattedType = trimmedType
              .replace(/_/g, " ")
              .replace(/variant/g, "v"); // Remplace "_" par un espace et "variant" par "v"
            if (counts[formattedType]) {
              counts[formattedType]++;
            } else {
              counts[formattedType] = 1;
            }
          });
        });

        resolve(counts);
      })
      .on("error", (error) => {
        reject(error);
      });
  })
    .then((counts) => {
      const formattedCounts = {};
      Object.keys(counts).forEach((key) => {
        formattedCounts[key] = counts[key];
      });
      return formattedCounts;
    })
    .catch((error) => {
      console.error(error);
    });
}

async function test2() {
  const obj = await JSON_distribution_par_type_de_mutation();
  const listObj = Object.entries(obj).map(([name, value]) => ({ name, value }));
  const result = await limit20Object(obj, listObj);
  return result;
}

test2();

//code6: bar

const JSON_nbre_mutation_par_impact_par_chromosome = () => {
  return new Promise((resolve) => {
    const data = [];
    fs.createReadStream(__dirname + "/uploads/" + "output.csv")
      .pipe(csv())
      .on("data", (row) => {
        data.push(row);
      })
      .on("end", () => {
        // Compter le nombre de mutations par chromosome et par impact
        const chromImpactCounts = {};
        data.forEach((row) => {
          const chrom = row.CHROM;
          const impact = row.IMPACT;
          if (!chromImpactCounts[chrom]) {
            chromImpactCounts[chrom] = {
              MODIFIER: 0,
              MODERATE: 0,
              HIGH: 0,
              LOW: 0,
            };
          }
          chromImpactCounts[chrom][impact]++;
        });

        resolve(chromImpactCounts);
      });
  });
};

const combineGraphData = async () => {
  const nombreDeMutationsParImpactParGène = await test();
  const distributionImpactParMutation =
    await JSON_distribution_impact_par_mutation();
  const distributionDesGènesParChromosome =
    await JSON_distribution_des_gènes_par_chromosome();
  const distributionParTypeDeMutation = await test2();
  const nbreMutationParImpactParChrom =
    await JSON_nbre_mutation_par_impact_par_chromosome();

  const combinedData = {
    nombre_de_mutations_par_impact_par_gène: nombreDeMutationsParImpactParGène,
    distribution_impact_par_mutation: distributionImpactParMutation,
    distribution_des_gènes_par_chromosome: distributionDesGènesParChromosome,
    distribution_par_type_de_mutation: distributionParTypeDeMutation,
    nombre_mutation_par_impact_par_chromosome: nbreMutationParImpactParChrom,
  };

  const combinedDataJson = JSON.stringify(combinedData);

  return combinedDataJson;
};

app.get("/dashboard", async (req, res) => {
  const combinedDataJson = await combineGraphData();
  res.send(combinedDataJson);
});

const outputJson = () => {
  return new Promise((resolve, reject) => {
    const data = [];

    fs.createReadStream(__dirname + "/uploads/output.csv")
      .pipe(csv())
      .on("data", (row) => {
        // Modification des valeurs de TYPE
        row.TYPE = row.TYPE.replace(/_/g, " ").replace(/&/g, " & ");

        // Rename the "NAME" key to "GENE"
        if (row.hasOwnProperty("NAME")) {
          row.GENE = row.NAME;
          delete row.NAME;
        }

        data.push(row);
      })
      .on("end", () => {
        resolve(data);
      })
      .on("error", (err) => {
        reject(err);
      });
  });
};
function choices(data) {
  const choices = { CHROM: [], TYPE: [], IMPACT: [], GENE: [] };
  for (const item of data) {
    for (const key in choices) {
      if (!choices[key].includes(item[key])) {
        choices[key].push(item[key]);
      }
    }
  }
  return choices;
}

// GET method to retrieve CSV data
app.get("/filters", async (req, res) => {
  try {
    const jsonData = await outputJson();
    res.json(choices(jsonData));
  } catch (error) {
    console.error("Error reading CSV file:", error);
    res.status(500).send("Error reading CSV file");
  }
});

app.get("/table", async (req, res) => {
  try {
    const jsonData = await outputJson();
    res.json(jsonData);
  } catch (error) {
    console.error("Error reading CSV file:", error);
    res.status(500).send("Error reading CSV file");
  }
});

function filtre(listeJson, genre, filtres) {
  const listeJsonFiltree = [];
  if (filtres.length === 0) {
    return listeJson;
  }
  for (const item of listeJson) {
    if (filtres.includes(item[genre])) {
      listeJsonFiltree.push(item);
    }
  }
  return listeJsonFiltree;
}

const genres = ["CHROM", "TYPE", "IMPACT", "GENE"];

async function filtrage(filtres) {
  let listeFiltree = await outputJson();

  for (const genre of genres) {
    listeFiltree = filtre(listeFiltree, genre, filtres[genre]);
  }
  return listeFiltree;
}

app.post("/table", async (req, res) => {
  const filtres = req.body;
  const listeFiltree = await filtrage(filtres);
  res.json(listeFiltree);
});

async function AnalyzePage(jsonList) {
  return new Promise((resolve, reject) => {
    const header = Object.keys(jsonList[0]); // Get the keys of the first object as column headers

    const typeIndex = header.indexOf("TYPE"); // Index of the "TYPE" column
    const refIndex = header.indexOf("REF"); // Index of the "REF" column
    const altIndex = header.indexOf("ALT"); // Index of the "ALT" column

    const firstRowData = Object.values(jsonList[0]); // Get the values of the first object as the first row

    const type = firstRowData[typeIndex]; // Value of the "TYPE" column
    const ref = firstRowData[refIndex]; // Value of the "REF" column
    const alt = firstRowData[altIndex]; // Value of the "ALT" column

    let mutationType;
    let deletionsCount = 0;
    let insertionsCount = 0;
    const counts = {};

    if (ref.length === 1 && alt.length === 1) {
      mutationType = "SNP";
    } else {
      mutationType = "INDEL";

      for (const row of jsonList) {
        const refValue = row.REF;
        const altValue = row.ALT;

        if (refValue.length > altValue.length) {
          deletionsCount++;
        } else {
          insertionsCount++;
        }
      }
    }

    for (const row of jsonList) {
      const types = row.TYPE.split("&");

      for (const type of types) {
        const trimmedType = type.trim();
        const formattedType = trimmedType.replace(/_/g, " ");

        if (counts[formattedType]) {
          counts[formattedType]++;
        } else {
          counts[formattedType] = 1;
        }
      }
    }

    const result = {
      counts,
      mutationType,
      deletionsCount,
      insertionsCount,
    };

    resolve(result);
  });
}

app.get("/analysis", async (req, res) => {
  AnalyzePage(await outputJson())
    .then((result) => {
      // Convertir l'objet JSON en chaîne de caractères
      const jsonResult = JSON.stringify(result);
      res.send(jsonResult);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
});

app.post("/analysis", async (req, res) => {
  const filtres = req.body;
  const listeFiltree = await filtrage(filtres);
  AnalyzePage(listeFiltree)
    .then((result) => {
      // Convertir l'objet JSON en chaîne de caractères
      const jsonResult = JSON.stringify(result);
      res.send(jsonResult);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
});

const generateReport = async (selectedFilters) => {
  // Ouvrir une instance de navigateur Puppeteer
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1920, height: 1390 },
  });

  // Créer une nouvelle page
  const page = await browser.newPage();

  // Naviguer vers le dashboard dans FL Variant
  await page.goto("http://localhost:3000/FL-Variant/dashboard");

  // Wait for 2 seconds
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Prendre un screenshot de la page
  const screenshot = await page.screenshot();

  // Fermer le navigateur Puppeteer
  await browser.close();

  // Obtenir le résultat du filtrage
  const filtres = selectedFilters;
  const filterResult = await filtrage(filtres);

  // Obtenir le résultat de AnalyzePage
  const analysisResult = await AnalyzePage(filterResult);

  // Créer un document PDF
  const doc = await PDFDocument.create();

  // Ajouter le screenshot au document PDF
  const image = await doc.embedPng(screenshot);

  // Page de bienvenue
  const welcomePage = doc.addPage([image.width, 700]);
  welcomePage.drawText("Welcome to FL Variant!", {
    x: 50,
    y: 600,
    size: 24,
  });
  welcomePage.drawText("Thank you for using our service.", {
    x: 50,
    y: 500,
    size: 18,
  });
  welcomePage.drawText(
    "The following pages contain your filtered data report:",
    {
      x: 50,
      y: 450,
      size: 18,
    }
  );
  welcomePage.drawText("Page 1: Filtered Data Table", {
    x: 50,
    y: 400,
    size: 18,
  });
  welcomePage.drawText("Page 2: Analysis of Data", {
    x: 50,
    y: 350,
    size: 18,
  });
  welcomePage.drawText("Page 3: Dashboard Screenshot", {
    x: 50,
    y: 300,
    size: 18,
  });
  const lesFiltres = createBulletPointList("\t\t", filtres, "-");
  welcomePage.drawText(
    // `filters: \n\n ${JSON.stringify(lesFiltres)}`,
    `filters: \n\n ${lesFiltres[0]}`,
    {
      x: 50,
      y: 250,
      size: 18,
    }
  );

  // Ajouter le résultat du filtrage au document PDF
  const filterTable = createTableFromObject(filterResult)[0];
  const filterPage = doc.addPage([
    image.width,
    createTableFromObject(filterResult)[1] * 20 + 30,
  ]);
  const filterTableHeight = drawTable(
    filterPage,
    filterTable,
    image.width,
    50,
    createTableFromObject(filterResult)[1] * 20
  );

  // Ajouter le résultat de AnalyzePage au document PDF

  const analysisPage = doc.addPage([
    image.width,
    createFirstList(analysisResult)[1] * 40,
  ]);
  const analysisText = createFirstList(analysisResult)[0];
  analysisPage.drawText(analysisText, {
    x: 50,
    y: createFirstList(analysisResult)[1] * 30,
  });

  // Ajouter le screenshot au document PDF
  const imagePage = doc.addPage([image.width, image.height]);
  imagePage.drawImage(image, {
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
  });

  // Générer le rapport PDF
  const pdfBytes = await doc.save();
  fs.writeFileSync(__dirname + "/uploads/report.pdf", pdfBytes);

  console.log("Le rapport a été généré avec succès.");
};

function createFirstList(obj) {
  const counts = createBulletPointList("\t\t\t", obj.counts, "-");
  let list = "";
  list += ` Analysis data:   \n\n\n\n\n`;
  list += ` This table contains ${counts[2]} ${obj.mutationType} made up of the following types:   \n\n`;
  list += counts[0];
  list += `\n Resulting in ${obj.deletionsCount} deletions and ${obj.insertionsCount} insertions.   \n`;
  return [list, counts[1] + 9];
}
// Fonction utilitaire pour créer une liste de points
function createBulletPointList(space, obj, bullet) {
  let list = "";
  let sum = 0;
  for (const [key, value] of Object.entries(obj)) {
    list += `${space} ${bullet} ${key}: ${value}\n`;
    sum += value;
  }
  return [list, Object.keys(obj).length, sum];
}

// Créer une table à partir d'un objet
function createTableFromObject(obj) {
  const table = [];

  // Ajouter les clés en tant que première ligne
  const headerRow = Object.keys(obj[0]);
  table.push(headerRow);

  // Ajouter les valeurs de chaque objet en tant que lignes
  for (const item of obj) {
    const dataRow = Object.values(item);
    table.push(dataRow);
  }

  return [table, obj.length + 1];
}

// Dessiner une table dans le document PDF
function drawTable(page, data, tableWidth, startX, startY) {
  const rowHeight = 20;
  const colWidth = tableWidth / data[0].length;
  let currentY = startY;

  data.forEach((row) => {
    let currentX = startX;

    row.forEach((cell) => {
      page.drawText(cell.toString(), {
        x: currentX,
        y: currentY,
        size: 12,
      });

      currentX += colWidth;
    });

    currentY -= rowHeight;
  });

  return rowHeight * data.length;
}

app.get("/download", async (req, res) => {
  try {
    await generateReport({ CHROM: [], GENE: [], IMPACT: [], TYPE: [] });
    const filePath = __dirname + "/uploads/report.pdf";
    res.download(filePath, "report.pdf", (err) => {
      if (err) {
        console.error("Error downloading the file:", err);
        res.status(500).send("Error downloading the file");
      } else {
        console.log("File sent successfully");
      }
    });
  } catch (error) {
    console.error("Error generating or downloading the report:", error);
    res.status(500).send("Error generating or downloading the report");
  }
});

app.post("/download", async (req, res) => {
  try {
    const filtres = req.body;
    await generateReport(filtres);
    const filePath = __dirname + "/uploads/report.pdf";
    res.download(filePath, "report.pdf", (err) => {
      if (err) {
        console.error("Error downloading the file:", err);
        res.status(500).send("Error downloading the file");
      } else {
        console.log("File sent successfully");
      }
    });
  } catch (error) {
    console.error("Error generating or downloading the report:", error);
    res.status(500).send("Error generating or downloading the report");
  }
});

app.listen(process.env.PORT || PORT, () =>
  console.log(`start listening on port : ${PORT}`)
);
