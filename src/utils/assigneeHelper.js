import { supabase } from '../supabaseClient';

const DEFAULT_RULES = {
    'Artes Digital': {
        'Post para redes sociales': 'Yarleny',
        'Historia para redes sociales': 'Yarleny',
        'Reel / video corto': 'Yarleny',
        'Banner web': 'Angelica',
        'HTML': 'Angelica',
        'Volante': 'Angelica',
        'DEFAULT': 'Yarleny'
    },
    'Rotulación Interna': 'Yoselyn',
    'Material para impresión': 'Yoselyn',
    'Recetarios Médicos': 'Angelica',
    'Activaciones/Eventos/Insumos/Utileria': 'Yoselyn',
    'Rotulación Externa': 'Emma'
};

let cachedRules = null;

export async function fetchAssigneeRules() {
    try {
        const { data, error } = await supabase
            .from('category_assignees')
            .select('*');

        if (error || !data || data.length === 0) {
            return DEFAULT_RULES;
        }

        const rulesMap = {};
        data.forEach(item => {
            const cat = item.category;
            const sub = item.sub_category;
            const target = item.assigned_to;

            if (sub && sub !== 'General') {
                if (!rulesMap[cat]) rulesMap[cat] = {};
                rulesMap[cat][sub] = target;
            } else {
                rulesMap[cat] = target;
            }
        });

        cachedRules = rulesMap;
        return rulesMap;
    } catch (e) {
        console.error('Error fetching assignee rules:', e);
        return DEFAULT_RULES;
    }
}

export function determineAssigneeWithRules(type, data, rules = null) {
    const activeRules = rules || cachedRules || DEFAULT_RULES;

    if (type === 'Artes Digital') {
        const sub = data?.tipoMaterial;
        const artesRules = activeRules['Artes Digital'];

        if (typeof artesRules === 'object' && artesRules !== null) {
            if (sub && artesRules[sub]) {
                return artesRules[sub];
            }
            return artesRules['Otro / General'] || artesRules['DEFAULT'] || 'Yarleny';
        }
        if (typeof artesRules === 'string') {
            return artesRules;
        }
        return 'Yarleny';
    }

    if (activeRules[type]) {
        const catValue = activeRules[type];
        if (typeof catValue === 'string') return catValue;
        if (typeof catValue === 'object' && catValue['General']) return catValue['General'];
    }

    // Fallback por defecto
    if (type === 'Rotulación Interna') return 'Yoselyn';
    if (type === 'Material para impresión') return 'Yoselyn';
    if (type === 'Recetarios Médicos') return 'Angelica';
    if (type === 'Activaciones/Eventos/Insumos/Utileria') return 'Yoselyn';
    if (type === 'Rotulación Externa') return 'Emma';
    
    return 'Sin asignar';
}
