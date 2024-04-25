const { app, BrowserWindow } = require('electron');
const http = require('http');
const { join } = require("node:path");
const socketIo = require('socket.io');
const qrcode = require('qrcode');
const fs = require('fs');
const ejs = require('ejs');
const html_to_pdf = require('html-pdf-node');
const {
    print,
    print2,
    getPaperSizeInfoAll,
    getPaperSizeInfo,
    getDefaultPrinter,
    getPrinters
} =  require("win32-pdf-printer");

let pdf_options = {};
// Function to render EJS template
async function renderTemplate(templatePath, data) {
    const template = fs.readFileSync(templatePath, 'utf-8');    
    return ejs.render(template, data_list=data);
}

// Function to generate HTML and save to file
async function generateQRCode(data) {
    let processedElement = data.replace(/\s/g, ''); 
    if (!processedElement.includes('|')) {
        processedElement += '|';
    }
    try {
      const qrCodeDataURL = await qrcode.toDataURL(processedElement);
      const base64Image = qrCodeDataURL.split(';base64,').pop();
      return base64Image;
    } catch (error) {
      console.error('Error generating QR code:', error);
      return '';
    }
}

// Function to generate HTML and save to file
async function generateHtml(templatePath, outputPath, data) {
    const htmlContent = await renderTemplate(templatePath, data);
  
    fs.writeFileSync(outputPath, htmlContent);
}

// Create server
const server = http.createServer();
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow your react app domain
        methods: ["GET", "POST"],  // Allowed request methods
    }
});

io.on('connection', (socket) => {
    console.log('A client connected');
    const DefaultPrinterName = getDefaultPrinter()?.PrinterName;
    socket.on('message', (msg) => {
        console.log('Message received:', msg);
        socket.emit('message', `Server received: ${msg}`);
    });

    socket.on('print-data', async message => {
        let label_type_name = message['label_name']
        let htmlOutputPath = `./source/${label_type_name}.html`;
        let pdfOutputPath = `./source/${label_type_name}.pdf`;
        if(label_type_name === 'label_print_new_1'){
            templatePath = `./source/label_print_new_1.ejs`;
            await Promise.all(message['data'].map(async (item) => {
              try {
                item['qr_code'] = await generateQRCode(item['part_code']);
              } catch (error) {
                item['qr_code'] = '';
                console.error(`Error generating QR code: ${error}`);
              }
            }));
        }else if(label_type_name === 'pos_label_new'){
            templatePath = `./source/pos_label_new.ejs`;
        }
    
        generateHtml(templatePath, htmlOutputPath, message["data"])
        .then(() => {
            let file = { content: fs.readFileSync(htmlOutputPath)}
            html_to_pdf.generatePdf(file, pdf_options).then(pdfBuffer => {
                fs.writeFileSync(pdfOutputPath, pdfBuffer)
                print(join(__dirname, pdfOutputPath), {
                    printer: DefaultPrinterName
                });
            });
        })
        .catch(err =>{console.log(err)
        })
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = 5000;
server.listen(PORT, () => console.log(`Printer Server Started Running..`));

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    });

    // Load a local HTML file or a remote URL
    win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
