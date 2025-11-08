// Declarar variables de vistas y estado en un ámbito accesible
const formContainer = document.getElementById('formContainer');
const loadingContainer = document.getElementById('loadingContainer');
const confirmationContainer = document.getElementById('confirmationContainer');
const form = document.getElementById('reclamacionForm');
const viewPdfButton = document.getElementById('viewPdfButton');

let formFields;
let generatedPdfBlobUrl = null; // Guardaremos la URL del PDF aquí

document.addEventListener('DOMContentLoaded', () => {
    // Asignar formFields una vez que el DOM está listo
    formFields = form.querySelectorAll('input[type="text"], input[type="date"], input[type="tel"], textarea');

    // Lógica para guardar y cargar datos del formulario en localStorage
    const saveData = () => formFields.forEach(field => localStorage.setItem(field.id, field.value));
    const loadData = () => {
        formFields.forEach(field => {
            const savedValue = localStorage.getItem(field.id);
            if (savedValue) field.value = savedValue;
        });
    };
    formFields.forEach(field => field.addEventListener('input', saveData));
    loadData();

    // Lógica para mostrar feedback de subida de archivos
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(input => {
        input.addEventListener('change', (event) => {
            const successMessage = event.target.closest('.input-ejemplo').querySelector('.upload-success-message');
            successMessage.style.display = event.target.files.length > 0 ? 'inline' : 'none';
        });
    });

    // Botón para crear una nueva reclamación
    const resetButton = document.getElementById('resetButton');
    resetButton.addEventListener('click', () => {
        formFields.forEach(field => localStorage.removeItem(field.id));
        window.location.reload();
    });
});

// Event listener para el envío del formulario
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    // Cambiar a la vista de "Cargando"
    formContainer.style.display = 'none';
    loadingContainer.style.display = 'block';

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
        const images = await getImagesAsBase64();
        const pdfBlob = await generatePdfBlob(data, images);
        generatedPdfBlobUrl = URL.createObjectURL(pdfBlob); // Guardar la URL del blob

        // Configurar el enlace de correo
        const mailtoLink = document.getElementById('mailtoLink');
        const subject = `Nueva Reclamación de: ${data.empresa} - Factura: ${data.factura || 'N/A'}`;
        const body = `Hola,\n\nHas recibido una nueva reclamación de la empresa: ${data.empresa}.\nPersona de contacto: ${data.contacto}.\n\nTodos los detalles y las imágenes están en el archivo PDF adjunto.\n\nSaludos.`;
        mailtoLink.href = `mailto:cvtools@cvtools.es,pablo@cvtools.es?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        // Cambiar a la vista de "Confirmación"
        loadingContainer.style.display = 'none';
        confirmationContainer.style.display = 'block';

    } catch (error) {
        console.error("Error detallado:", error); // Añadido para mejor depuración
        alert(error.message || 'Hubo un problema al generar el PDF.');
        // Volver a la vista del formulario si hay un error
        loadingContainer.style.display = 'none';
        formContainer.style.display = 'block';
    }
});

// Event listener para el botón "Ver y Guardar PDF"
viewPdfButton.addEventListener('click', () => {
    if (generatedPdfBlobUrl) {
        window.open(generatedPdfBlobUrl, '_blank');
        // Limpiar localStorage DESPUÉS de que el usuario haya visto el PDF
        formFields.forEach(field => localStorage.removeItem(field.id));
    } else {
        alert("Error: No se ha generado ningún PDF.");
    }
});

// --- FUNCIONES AUXILIARES ---

/**
 * Función CORREGIDA Y ROBUSTA para obtener imágenes y evitar el error "cannot read properties of null".
 * Solo busca los IDs definidos en 'fileInputIds' y maneja correctamente si un elemento no existe o no tiene archivo.
 */
function getImagesAsBase64() {
    const fileInputIds = ['fotoDelantera', 'fotoTrasera']; // IDs de los campos de imagen en el HTML
    
    const filePromises = fileInputIds.map((id, index) => {
        const inputElement = document.getElementById(id);

        // ---- INICIO DE LA CORRECCIÓN CLAVE ----
        // 1. Comprobamos si el elemento HTML realmente existe antes de intentar usarlo.
        if (!inputElement) {
            console.warn(`El campo de imagen con ID "${id}" no se encontró en el HTML. Será omitido.`);
            // Devolvemos una promesa que se resuelve a 'null' para no romper la cadena.
            return Promise.resolve(null);
        }
        // ---- FIN DE LA CORRECCIÓN CLAVE ----

        return new Promise((resolve, reject) => {
            // 2. Ahora que sabemos que el elemento existe, comprobamos si tiene archivos.
            if (inputElement.files && inputElement.files.length > 0) {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (err) => {
                    console.error(`Error al leer el archivo de ${id}:`, err);
                    reject(new Error(`No se pudo leer el archivo de la imagen ${index + 1}.`));
                };
                reader.readAsDataURL(inputElement.files[0]);
            } else {
                // 3. Verificamos si la imagen es obligatoria (atributo 'required' en HTML)
                if (inputElement.hasAttribute('required')) {
                    // Si es requerida y no se ha subido, rechazamos la promesa para mostrar un error.
                    reject(new Error(`La imagen ${index + 1} es obligatoria.`));
                } else {
                    // Si no es requerida y está vacía, la omitimos resolviendo a 'null'.
                    resolve(null);
                }
            }
        });
    });

    // Promise.all espera a que todas las promesas se resuelvan
    return Promise.all(filePromises).then(([delantera, trasera]) => {
        // Devolvemos un objeto, como en la versión anterior.
        return { delantera, trasera };
    });
}


async function generatePdfBlob(data, images) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    
    const margin = 10;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (margin * 2);

    try {
        const logoBase64 = await imageToBase64('img/logo.png');
        doc.addImage(logoBase64, 'PNG', margin, 5, 40, 20); 
    } catch (logoError) {
        console.warn('Logo no encontrado:', logoError);
    }

    doc.setFontSize(16).setFont('Helvetica', 'bold');
    doc.text('FORMULARIO DE RECLAMACIÓN', pageWidth / 2, 22, { align: 'center' });
    doc.setDrawColor(0, 0, 0).setLineWidth(0.5).line(margin, 28, pageWidth - margin, 28);

    let y = 35;
    const fieldHeight = 8, labelWidth = 50, dataWidth = contentWidth - labelWidth;
    const col1X = margin;
    
    const drawField = (label, value, x, yPos) => {
        doc.setFontSize(9).setFont('Helvetica', 'bold').setFillColor(230, 230, 230);
        doc.rect(x, yPos, labelWidth, fieldHeight, 'FD');
        doc.setTextColor(0, 0, 0).text(label, x + 2, yPos + 5);
        doc.rect(x + labelWidth, yPos, dataWidth, fieldHeight, 'S');
        doc.setFont('Helvetica', 'normal').text(value || '', x + labelWidth + 2, yPos + 5);
    };

    drawField('FECHA', data.fecha, col1X, y); y += fieldHeight;
    drawField('EMPRESA', data.empresa, col1X, y); y += fieldHeight;
    drawField('PERSONA DE CONTACTO', data.contacto, col1X, y); y += fieldHeight;
    drawField('Nº FACTURA O ALBARÁN', data.factura, col1X, y); y += fieldHeight;
    drawField('TELÉFONO', data.telefono, col1X, y); y += fieldHeight;
    drawField('REFERENCIA PRODUCTO', data.referencia, col1X, y); y += fieldHeight + 5;

    doc.setFontSize(9).setFont('Helvetica', 'bold').text('DESCRIPCIÓN DEL DEFECTO', col1X, y); y += 4;
    const descHeight = 35;
    doc.rect(col1X, y, contentWidth, descHeight, 'S');
    const splitDescription = doc.splitTextToSize(data.defecto, contentWidth - 4);
    doc.setFont('Helvetica', 'normal').text(splitDescription, col1X + 2, y + 5);
    y += descHeight + 10;

    doc.setFontSize(9).setFont('Helvetica', 'bold').text('FOTOGRAFÍAS ADJUNTAS', col1X, y); y += 4;
    const photoAreaStartY = y;
    const photoMargin = 5;
    const photoGridWidth = (contentWidth - photoMargin) / 2;
    const photoGridHeight = photoGridWidth * (3 / 4);

    if (images.delantera) {
        doc.addImage(images.delantera, 'JPEG', col1X, photoAreaStartY, photoGridWidth, photoGridHeight);
    }
    if (images.trasera) {
        doc.addImage(images.trasera, 'JPEG', col1X + photoGridWidth + photoMargin, photoAreaStartY, photoGridWidth, photoGridHeight);
    }

    return doc.output('blob');
}

function imageToBase64(url) {
    return new Promise((resolve, reject) => {
        fetch(url)
            .then(res => res.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            })
            .catch(reject);
    });
}