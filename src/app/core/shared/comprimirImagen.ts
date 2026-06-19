export class ComprimirImagen {

    // Metodo para comprimir el tamaño o peso de la imagen cargada en un input type:"file"
    comprimirImagen(file: File): Promise<File> {
        return new Promise((resolve, reject) => {
            if (!file) {
                // No es una imagen, resuelve con el archivo tal como está
                resolve(file);
                return;
            }

            // 1200, 720, 0.8
            let maxWidth: number = 1200, maxHeight: number = 720, quality: number = 0.8;

            const reader = new FileReader();
            reader.readAsDataURL(file);

            reader.onload = (event: any) => {
                const img = new Image();
                img.src = event.target.result;

                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }

                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            const compressedFile = new File([blob], file.name, { type: file.type });
                            resolve(compressedFile);
                        } else {
                            reject(new Error('Error al comprimir la imagen.'));
                        }
                    }, file.type, quality);
                };
            };

            reader.onerror = () => {
                reject(new Error('Error al leer el archivo.'));
            };
        });
    }

    // Metodo para comprimir el tamaño o peso de la imagen cargada en Dropzone
    comprimirImagenDropzone(file: ExtendedFile, quality: number = 0.8): Promise<ExtendedFile> {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('image/')) {
                // No es una imagen, resuelve con el archivo tal como está
                resolve(file);
                return;
            }

            let maxWidth: number = 1200, maxHeight: number = 720;

            const reader = new FileReader();
            reader.readAsDataURL(file);

            reader.onload = (event: any) => {
                const img = new Image();
                img.src = event.target.result;

                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }

                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    ctx.drawImage(img, 0, 0, width, height);

                    // Crear un objeto de información de carga simulado
                    const uploadInfo = {
                        uuid: file.upload?.uuid || 'generated-uuid', // Utilizar el UUID existente o generar uno nuevo
                        progress: 0,
                        total: file.size, // Conservar el tamaño original del archivo
                        bytesSent: 0,
                        filename: file.name,
                    };

                    // Utilizar siempre el tipo original del archivo al guardar la imagen comprimida
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const compressedFile = new File([blob], file.name, { type: file.type, lastModified: file.lastModified });

                            // Extender el archivo comprimido con la propiedad 'upload' y otros detalles
                            Object.assign(compressedFile, {
                                upload: uploadInfo,
                                status: "queued",
                                previewElement: {},
                                previewTemplate: {},
                                _removeLink: {
                                    "__zone_symbol__clickfalse": [
                                        {
                                            "type": "eventTask",
                                            "state": "scheduled",
                                            "source": "HTMLAnchorElement.addEventListener:click",
                                            "zone": "angular",
                                            "runCount": 0
                                        }
                                    ]
                                },
                                accepted: true,
                            });

                            resolve(compressedFile as ExtendedFile);
                        } else {
                            reject(new Error('Error al comprimir la imagen.'));
                        }
                    }, file.type, quality);
                };
            };

            reader.onerror = () => {
                reject(new Error('Error al leer el archivo.'));
            };
        });
    }
}

// Esta interface sirve para comprimir la imagen de Dropzone
interface ExtendedFile extends File {
    upload?: {
        uuid: string;
        progress: number;
        total: number;
        bytesSent: number;
        filename: string;
    };
}