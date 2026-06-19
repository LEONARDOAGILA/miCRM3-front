import { Injectable } from '@angular/core';
import { ClienteModel } from '../modules/clientes/interfaces/clienteModel';
import { ProductoModel } from '../modules/inventarios/interfaces/productoModel';

@Injectable({
  providedIn: 'root',
})
export class DatosPruebaService {

  // Clientes de ejemplo
  public clientesEjemplo: ClienteModel[] = [
    { id: 1, identificacion: '001', nombre: 'nombre_1', apellido: 'apellido_1', nombre_completo: 'nombre_1 apellido_1', email: 'test@gmail.com', telefono: '9999999999', direccion: 'calle pruebas', estado: true },
    { id: 2, identificacion: '002', nombre: 'nombre_2', apellido: 'apellido_2', nombre_completo: 'nombre_2 apellido_2', email: 'test@gmail.com', telefono: '9999999999', direccion: 'calle pruebas', estado: true },
    { id: 3, identificacion: '003', nombre: 'nombre_3', apellido: 'apellido_3', nombre_completo: 'nombre_3 apellido_3', email: 'test@gmail.com', telefono: '9999999999', direccion: 'calle pruebas', estado: true },
    { id: 4, identificacion: '004', nombre: 'nombre_4', apellido: 'apellido_4', nombre_completo: 'nombre_4 apellido_4', email: 'test@gmail.com', telefono: '9999999999', direccion: 'calle pruebas', estado: true },
    { id: 5, identificacion: '005', nombre: 'nombre_5', apellido: 'apellido_5', nombre_completo: 'nombre_5 apellido_5', email: 'test@gmail.com', telefono: '9999999999', direccion: 'calle pruebas', estado: true },
  ];

  // Productos de ejemplo
  public productosEjemplo: ProductoModel[] = [
    { id: 1, codigo: "001", nombre: 'Laptop HP Pavilion', descripcion: 'Laptop HP Pavilion', precio_unitario: 899.99, costo: 1799.98, stock: 10, estado: true },
    { id: 2, codigo: "002", nombre: 'Mouse Inalámbrico', descripcion: 'Mouse Inalámbrico', precio_unitario: 25.50, costo: 76.50, stock: 10, estado: true },
    { id: 3, codigo: "003", nombre: 'Teclado Mecánico', descripcion: 'Teclado Mecánico', precio_unitario: 89.99, costo: 89.99, stock: 10, estado: true },
    { id: 4, codigo: "004", nombre: 'Monitor 24" LED', descripcion: 'Monitor 24" LED', precio_unitario: 199.99, costo: 399.98, stock: 10, estado: true },
    { id: 5, codigo: "005", nombre: 'Impresora Laser', descripcion: 'Impresora Laser', precio_unitario: 249.99, costo: 249.99, stock: 10, estado: true },
  ];

  constructor() {

  }

}

