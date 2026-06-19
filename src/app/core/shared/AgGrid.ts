export class AgGrid {

    // Metodo para cuando el panel se expanda en pantalla completa tome un nuevo tamaño el agGrid
    tamanoAgGrid(expanded: boolean, tamanoInicial: string, tamanoExpandido: string): string {
        // expanded lo que devuelve el panel de control en el metodo panelExpand, tamanoInicial o predefinido del grid, tamanoExpandido cuando el grid esta en pantalla completa
        return expanded ? tamanoExpandido : tamanoInicial;
    }

}
