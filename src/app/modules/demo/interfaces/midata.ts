export interface Midata {
	userId: number;
	id: number;
	title: string;
	body: string;
}


export interface Pokemon {
	name: string;
	url: string;
}
export interface PokemonResults {
	count: number;
	next?: any;
	previous?: any;
	results: Pokemon[]
}

