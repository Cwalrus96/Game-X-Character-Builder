/** Authoring-only native Sheets formulas. These do not adapt runtime game data. */
import {prerequisiteTextFormula} from './technique-display-formulas.mjs';

export const DISPLAY_COLUMNS = Object.freeze({
  Classes: ['classKey', 'name', 'pitch', 'examples', 'hpProgression', 'primaryAttributeA', 'primaryAttributeB', 'combatTechniqueSkill', 'combatSkills', 'utilitySkillOptions', 'levelUp', 'notes', 'status'],
  ClassFeatures: ['classKey', 'level', 'rowType', 'featureKey', 'name', 'parentKey', 'description', 'chooseCount', 'grants', 'grantNotes', 'prerequisites', 'notes', 'grantText', 'traitKeys'],
  OriginFeatures: ['originKey', 'level', 'rowType', 'featureKey', 'name', 'description', 'grants', 'grantNotes', 'parentKey', 'chooseCount', 'prerequisites', 'notes', 'grantText', 'traitKeys'],
  Feats: ['category', 'rowType', 'featKey', 'name', 'parentKey', 'prerequisites', 'description', 'grants', 'grantNotes', 'featType', 'chooseCount', 'notes', 'grantText', 'archetypeKey', 'archetypeName'],
  WeaponBases: ['weaponKey', 'name', 'description', 'minRank', 'tags', 'notes', 'sourceNote', 'tagKeys', 'techniqueKeys', 'traitsText'],
  WeaponEnhancements: ['enhancementKey', 'name', 'description', 'minRank', 'prerequisites', 'notes', 'sourceNote', 'selectionMode'],
  WeaponProfiles: ['weaponKey', 'profileType', 'profileName', 'description', 'rank', 'tags', 'actionType', 'actions', 'trigger', 'energyCost', 'strainCost', 'sustained', 'rollRequired', 'attribute', 'skill', 'defense', 'range', 'targets', 'damage', 'damageTier', 'onSuccess', 'onCriticalSuccess', 'onFailure', 'onCriticalFailure', 'bondEffect', 'notes', 'damageByRank', 'pumpDamageByRank', 'rankNotes', 'prerequisites', 'sourceNote'],
});

export const OPTIONAL_DISPLAY_COLUMNS = Object.freeze({
  Classes: ['levelUp', 'notes'],
  ClassFeatures: ['grantNotes', 'notes', 'grantText', 'traitKeys'],
  OriginFeatures: ['grantNotes', 'notes', 'grantText', 'traitKeys'],
  Feats: ['grantNotes', 'notes', 'grantText'],
  WeaponBases: ['notes', 'sourceNote', 'tagKeys', 'traitsText'],
  WeaponEnhancements: ['notes', 'sourceNote'],
});

const quoted = value => `"${String(value).replaceAll('"', '""')}"`;
const array = values => `{${values.map(quoted).join(',')}}`;

/** Preserve compatibility positions without retaining duplicate authored columns. */
export function displayProjectionFormula(sheetName) {
  const columns = DISPLAY_COLUMNS[sheetName];
  if (!columns) throw new Error(`Unknown display projection: ${sheetName}`);
  if (sheetName === 'WeaponProfiles') return `=${array(columns)}`;
  const optional = new Set(OPTIONAL_DISPLAY_COLUMNS[sheetName]);
  const field = name => `${optional.has(name) ? 'optional' : 'column'}(${quoted(name)})`;
  const parts = columns.map(name => name === 'grants'
    ? `MAP(${field('grants')},${field('grantText')},LAMBDA(grant,prose,IF(grant="grants",grant,IF(prose<>"",prose,grant))))`
    : field(name));
  return `=LET(raw,DATA_IMPORT_SHEET(${quoted(sheetName)}),headers,INDEX(raw,1,0),blank,LAMBDA(label,MAKEARRAY(ROWS(raw),1,LAMBDA(rownum,colnum,IF(rownum=1,label,"")))),column,LAMBDA(label,CHOOSECOLS(raw,XMATCH(label,headers,0))),optional,LAMBDA(label,LET(position,IFNA(XMATCH(label,headers,0),0),IF(position=0,blank(label),CHOOSECOLS(raw,MAX(1,position))))),HSTACK(${parts.join(',')}))`;
}

/** Local preview of the header projection, used to verify an edit plan before native installation. */
export function projectDisplayTable(sheetName, rows) {
  const columns = DISPLAY_COLUMNS[sheetName];
  if (!columns) throw new Error(`Unknown display projection: ${sheetName}`);
  if (sheetName === 'WeaponProfiles') return [columns.slice()];
  const headers = rows[0] ?? [];
  const optional = new Set(OPTIONAL_DISPLAY_COLUMNS[sheetName]);
  for (const name of columns) {
    if (!optional.has(name) && !headers.includes(name)) throw new Error(`${sheetName}: missing required header ${name}`);
  }
  const value = (row, name) => row[headers.indexOf(name)] ?? '';
  return [columns.slice(), ...rows.slice(1).map(row => columns.map(name => name === 'grants'
    ? value(row, 'grantText') || value(row, name)
    : value(row, name)))];
}

/** Identity diagnostics deliberately do not classify duplicate display names as errors. */
export function diagnoseDisplayIdentities(rows, {sheetName, keyColumn, nameColumn = 'name', parentColumn = 'parentKey'} = {}) {
  const headers = rows[0] ?? [];
  const keyIndex = headers.indexOf(keyColumn), nameIndex = headers.indexOf(nameColumn), parentIndex = headers.indexOf(parentColumn);
  if (keyIndex < 0 || nameIndex < 0) throw new Error(`${sheetName}: identity headers are missing`);
  const populated = rows.slice(1).map((values, index) => ({values, row: index + 2})).filter(({values}) => values.some(value => value !== '' && value !== null && value !== undefined));
  const keyCounts = new Map();
  for (const {values} of populated) if (values[keyIndex]) keyCounts.set(values[keyIndex], (keyCounts.get(values[keyIndex]) ?? 0) + 1);
  const diagnostics = [];
  for (const {values, row} of populated) {
    const key = values[keyIndex] ?? '', name = values[nameIndex] ?? '', parent = values[parentIndex] ?? '';
    if (!key || !name) diagnostics.push({sheet: sheetName, row, key, code: 'incomplete-identity', message: [!key && `Missing ${keyColumn}`, !name && `Missing ${nameColumn}`].filter(Boolean).join('; ')});
    if (key && keyCounts.get(key) > 1) diagnostics.push({sheet: sheetName, row, key, code: 'duplicate-key', message: `Duplicate ${keyColumn}`});
    if (parent && !keyCounts.has(parent)) diagnostics.push({sheet: sheetName, row, key, code: 'missing-parent', message: `Unresolved parentKey: ${parent}`});
  }
  return diagnostics;
}

function featImportFormula() {
  const projection = displayProjectionFormula('Feats').slice(1);
  // This uses the independent raw-source archetype import, avoiding a cycle through _Feats.
  return `=LET(data,${projection},header,INDEX(data,1,0),precol,XMATCH("prerequisites",header,0),prereqs,CHOOSECOLS(data,precol),readable,MAP(prereqs,LAMBDA(prerequisite,IF(prerequisite="","",TEXTJOIN(CHAR(10),FALSE,MAP(SPLIT(prerequisite,CHAR(10),FALSE,FALSE),LAMBDA(line,IF(REGEXMATCH(line,"^archetype \\| [^|]+ \\| numFeats=[0-9]+$"),LET(target,REGEXEXTRACT(line,"^archetype \\| ([^|]+) \\|"),minimum,REGEXEXTRACT(line,"numFeats=([0-9]+)$"),archetype,IFNA(XLOOKUP(target,'_ArchetypeFeats'!B2:B1000,'_ArchetypeFeats'!C2:C1000),IFNA(XLOOKUP(target&"-initiate",'_ArchetypeFeats'!A2:A1000,'_ArchetypeFeats'!C2:C1000),"")),IF(archetype="",line,"Prior "&archetype&" archetype feats: "&minimum&".")),line))))))),HSTACK(CHOOSECOLS(data,SEQUENCE(1,precol-1)),readable,CHOOSECOLS(data,SEQUENCE(1,COLUMNS(data)-precol,precol+1))))`;
}

export function archetypeImportFormula() {
  return '=LET(raw,DATA_IMPORT_SHEET("Feats"),head,INDEX(raw,1,0),field,LAMBDA(label,CHOOSECOLS(raw,XMATCH(label,head,0))),fk,field("featKey"),names,field("name"),ak,field("archetypeKey"),an,field("archetypeName"),cat,field("category"),rt,field("rowType"),ft,field("featType"),pre,field("prerequisites"),labels,MAP(ak,LAMBDA(key,IF(OR(key="",key="archetypeKey"),"",IFNA(INDEX(FILTER(an,ak=key,an<>""),1),key)))),minimum,MAP(ak,pre,LAMBDA(key,prerequisite,IF(OR(key="",key="archetypeKey"),0,IFERROR(VALUE(REGEXEXTRACT(prerequisite,"(?:^|"&CHAR(10)&")archetype \\| "&key&" \\| numFeats=([0-9]+)(?:"&CHAR(10)&"|$)")),0)))),VSTACK({"featKey","archetypeKey","archetypeName","archetypeType","classKey","minPreviousArchetypeFeats"},FILTER(HSTACK(fk,ak,labels,ARRAYFORMULA(IF(cat="multiclass","multiclass","subclass")),ARRAYFORMULA(IF(cat="multiclass","",cat)),minimum),fk<>"",names<>"",ak<>"",ft="archetype",rt<>"OPTION")))';
}

export function archetypeCatalogueFormula(classKey = null) {
  const type = classKey === null ? 'multiclass' : 'subclass';
  const condition = `'_ArchetypeFeats'!D2:D1000=${quoted(type)}${classKey === null ? '' : `,'_ArchetypeFeats'!E2:E1000=${quoted(classKey)}`}`;
  return `=LET(data,FILTER('_ArchetypeFeats'!A2:F1000,${condition}),keys,CHOOSECOLS(data,1),names,MAP(keys,LAMBDA(key,XLOOKUP(key,'_Feats'!C2:C1000,'_Feats'!D2:D1000))),ordered,SORT(HSTACK(data,MAP(names,LAMBDA(name,IF(REGEXMATCH(name,"(?i)initiate"),0,1))),names),2,TRUE,6,TRUE,7,TRUE,8,TRUE,1,TRUE),MAP(CHOOSECOLS(ordered,1),CHOOSECOLS(ordered,3),CHOOSECOLS(ordered,5),CHOOSECOLS(ordered,6),LAMBDA(key,archetype,classkey,minimum,LET(block,REGEXREPLACE(FEAT_BLOCK(key),"(\\n\\nGrants:) {3}\\* ([^\\n]+)$","$1 $2"),SUBSTITUTE(block,CHAR(10)&CHAR(10),CHAR(10)&CHAR(10)&"Type: ${type === 'multiclass' ? 'Multiclass' : 'Subclass'} Archetype"&CHAR(10)&"Archetype: "&archetype&CHAR(10)&"Access: "&IF(classkey="","Any class",XLOOKUP(classkey,'_Classes'!A2:A1000,'_Classes'!B2:B1000))&IF(AND(COUNTUNIQUE(FILTER('_ArchetypeFeats'!B2:B1000,'_ArchetypeFeats'!C2:C1000=archetype))=1,IFERROR(FIND(CHAR(10)&"Prior "&archetype&" archetype feats: "&minimum&"."&CHAR(10),CHAR(10)&block&CHAR(10)),0)>0),"",CHAR(10)&"Previous archetype feats required: "&minimum)&CHAR(10)&CHAR(10),1)))))`;
}

// These columns are bound to existing handbook sections; do not reorder them when source rows move.
export const FEAT_CATEGORY_COLUMNS = Object.freeze(['ninja', 'magical-guardian', 'monster-tamer', 'spirit-warrior', 'weapon-master', 'henshin-hero', 'metamorph']);

export function featCatalogueFormula() {
  return `=LET(categories,${array(FEAT_CATEGORY_COLUMNS)},category,'_Feats'!A2:A1000,rowtype,'_Feats'!B2:B1000,keys,'_Feats'!C2:C1000,names,'_Feats'!D2:D1000,parents,'_Feats'!E2:E1000,kind,'_Feats'!J2:J1000,counts,MAP(categories,LAMBDA(group,SUM(ARRAYFORMULA(N((category=group)*(kind="class")*(rowtype<>"OPTION")*(keys<>"")*(names<>"")*(parents="")))))),MAKEARRAY(MAX(1,counts),COLUMNS(categories),LAMBDA(rownum,colnum,IF(rownum>INDEX(counts,1,colnum),"",LET(key,INDEX(FILTER(keys,category=INDEX(categories,1,colnum),kind="class",rowtype<>"OPTION",keys<>"",names<>"",parents=""),rownum),REGEXREPLACE(FEAT_BLOCK(key),"(\\n\\nGrants:) {3}\\* ([^\\n]+)$","$1 $2"))))))`;
}

/** Traits keep prose ownership; acquired tags in grants do not add a second benefit paragraph. */
export function traitCatalogueFormula(source = 'Traits!A1:L1000') {
  const prerequisites = prerequisiteTextFormula('pretext', {traits: 'src'});
  return `=LET(src,${source},head,INDEX(src,1,0),keys,CHOOSECOLS(src,XMATCH("traitKey",head,0)),names,CHOOSECOLS(src,XMATCH("name",head,0)),optional,LAMBDA(field,LET(position,IFNA(XMATCH(field,head,0),0),IF(position=0,MAP(keys,LAMBDA(item,"")),CHOOSECOLS(src,MAX(1,position))))),ranks,optional("rank"),prereqs,optional("prerequisites"),tags,optional("tags"),descriptions,optional("description"),ranknotes,optional("rankNotes"),refs,optional("techniqueKeys"),modes,optional("selectionMode"),duplicates,optional("duplicateGroup"),reviews,optional("reviewNotes"),MAP(FILTER(keys,keys<>"",keys<>"traitKey"),LAMBDA(key,LET(name,XLOOKUP(key,keys,names),rank,XLOOKUP(key,keys,ranks),rankmissing,LEN(TO_TEXT(rank))=0,pretext,XLOOKUP(key,keys,prereqs),tagtext,XLOOKUP(key,keys,tags),description,XLOOKUP(key,keys,descriptions),ranktext,XLOOKUP(key,keys,ranknotes),references,XLOOKUP(key,keys,refs),mode,XLOOKUP(key,keys,modes),duplicategroup,XLOOKUP(key,keys,duplicates),review,XLOOKUP(key,keys,reviews),refsvalid,IF(references="",TRUE,AND(MAP(SPLIT(references,","),LAMBDA(techkey,COUNTIF('_TechniqueBlocks'!A1:A1000,TRIM(techkey))=1)))),IF(OR(COUNTIF(keys,key)<>1,name="",NOT(refsvalid)),NA(),TEXTJOIN(CHAR(10),TRUE,"**"&name&" - Rank "&IF(rankmissing,"?",rank)&"**","**Prerequisites:** "&IF(pretext="","None",${prerequisites}),"**Tags:** "&IF(tagtext="","—",tagtext))&CHAR(10)&CHAR(10)&TEXTJOIN(CHAR(10),TRUE,description,ranktext,IF(duplicategroup="","","*Possible duplicate: "&duplicategroup&"*"),IF(review="","",TEXTJOIN(CHAR(10),TRUE,MAP(TRANSPOSE(SPLIT(review,CHAR(10),FALSE,TRUE)),LAMBDA(line,"*"&line&"*")))),IF(OR(rankmissing,mode="draft"),"*Incomplete Trait*","")))))))`;
}

/** Replacements retain the existing named-function signatures and formatting. */
export const DISPLAY_NAMED_FUNCTIONS = Object.freeze({
  DATA_GET_COLUMN_BY_NAME: {
    argumentPlaceholders: ['sheet_name', 'column_name'],
    formula: '=LET(table,DATA_IMPORT_SHEET_LOCAL(sheet_name),headers,INDEX(table,1,0),column_number,IFNA(XMATCH(column_name,headers,0),0),full_column,IF(column_number=0,MAKEARRAY(ROWS(table),1,LAMBDA(rownum,colnum,"")),INDEX(table,0,column_number)),FILTER(full_column,SEQUENCE(ROWS(full_column))>1))',
  },
  DATA_GET_FIELD_BY_KEY: {
    argumentPlaceholders: ['sheet_name', 'key_column', 'key_value', 'field_name'],
    formula: '=LET(key_values,DATA_GET_COLUMN_BY_NAME(sheet_name,key_column),field_values,DATA_GET_COLUMN_BY_NAME(sheet_name,field_name),matches,SUM(ARRAYFORMULA(N(key_values=key_value))),IF(OR(key_value="",matches<>1),NA(),INDEX(field_values,XMATCH(key_value,key_values,0))))',
  },
  FEAT_OPTION_GROUP_BLOCK: {
    argumentPlaceholders: ['feat_key'],
    formula: '=LET(group_name,FEAT_GET_FIELD(feat_key,"name"),prerequisites,FEAT_GET_FIELD(feat_key,"prerequisites"),description,FEAT_GET_FIELD(feat_key,"description"),grants,FEAT_GET_FIELD(feat_key,"grants"),option_keys,IFERROR(FILTER(DATA_GET_COLUMN_BY_NAME("Feats","featKey"),DATA_GET_COLUMN_BY_NAME("Feats","rowType")="OPTION",DATA_GET_COLUMN_BY_NAME("Feats","parentKey")=feat_key),""),option_lines,IFERROR(MAP(option_keys,LAMBDA(option_key,OPTION_LINE("Feats","featKey",option_key))),""),TEXTJOIN(CHAR(10)&CHAR(10),TRUE,"**"&group_name&"**",IF(prerequisites<>"","Prerequisites:"&CHAR(10)&PREREQ_BLOCK(prerequisites),""),description,IF(grants<>"",GRANT_BLOCK(grants),""),TEXTJOIN(CHAR(10),TRUE,option_lines)))',
  },
  CLASS_OPTION_GROUP_BLOCKS: {
    argumentPlaceholders: ['class_key', 'lvl'],
    formula: '=IFERROR(LET(cf,"ClassFeatures",class_key_filter,ARRAYFORMULA(DATA_GET_COLUMN_BY_NAME(cf,"classKey")=class_key),level_filter,ARRAYFORMULA(DATA_GET_COLUMN_BY_NAME(cf,"level")=lvl),row_type_filter,ARRAYFORMULA(DATA_GET_COLUMN_BY_NAME(cf,"rowType")="OPTION_GROUP"),full_filter,ARRAYFORMULA(class_key_filter*level_filter*row_type_filter),MAP(FILTER(DATA_GET_COLUMN_BY_NAME(cf,"featureKey"),full_filter),FILTER(DATA_GET_COLUMN_BY_NAME(cf,"description"),full_filter),FILTER(DATA_GET_COLUMN_BY_NAME(cf,"grants"),full_filter),LAMBDA(group_key,group_desc,group_grants,OPTION_GROUP_BLOCK(class_key,lvl,group_key,group_desc,group_grants)))),"")',
  },
  OPTION_GROUP_BLOCK: {
    // group_name is a historical argument name; its value is now the stable featureKey.
    argumentPlaceholders: ['class_key', 'lvl', 'group_name', 'group_desc', 'group_grants'],
    formula: '=LET(label,DATA_GET_FIELD_BY_KEY("ClassFeatures","featureKey",group_name,"name"),base_group,"**"&label&"**"&IF(group_desc<>"",CHAR(10)&group_desc,""),group_grants_block,IF(group_grants="","",GRANT_BLOCK(group_grants)),cf,"ClassFeatures",class_key_filter,ARRAYFORMULA(DATA_GET_COLUMN_BY_NAME(cf,"classKey")=class_key),level_filter,ARRAYFORMULA(DATA_GET_COLUMN_BY_NAME(cf,"level")=lvl),row_type_filter,ARRAYFORMULA(DATA_GET_COLUMN_BY_NAME(cf,"rowType")="OPTION"),parent_key_filter,ARRAYFORMULA(DATA_GET_COLUMN_BY_NAME(cf,"parentKey")=group_name),full_filter,ARRAYFORMULA(class_key_filter*level_filter*row_type_filter*parent_key_filter),option_lines,IFERROR(MAP(FILTER(DATA_GET_COLUMN_BY_NAME(cf,"name"),full_filter),FILTER(DATA_GET_COLUMN_BY_NAME(cf,"description"),full_filter),FILTER(DATA_GET_COLUMN_BY_NAME(cf,"grants"),full_filter),LAMBDA(option_name,option_desc,option_grants,OPTION_LINE_FROM_FIELDS(option_name,option_desc,option_grants))),""),base_group&IF(group_grants_block<>"",CHAR(10)&CHAR(10)&group_grants_block,"")&IF(COUNTA(option_lines)>0,CHAR(10)&CHAR(10)&TEXTJOIN(CHAR(10),TRUE,option_lines),""))',
  },
});

/** Native installation payload; no network or file writes occur here. */
export function buildSchemaDisplayAdapters() {
  const cells = {};
  for (const name of ['Classes', 'ClassFeatures', 'OriginFeatures', 'WeaponBases', 'WeaponEnhancements', 'WeaponProfiles']) {
    cells[`${name.startsWith('Weapon') ? '' : '_'}${name}!A1`] = displayProjectionFormula(name);
  }
  cells['_Feats!A1'] = featImportFormula();
  cells['_ArchetypeFeats!A1'] = archetypeImportFormula();
  cells['Feats_Display!A2'] = featCatalogueFormula();
  cells['Traits_Display!A1'] = traitCatalogueFormula();
  [null, 'ninja', 'magical-guardian', 'spirit-warrior', 'weapon-master', 'henshin-hero', 'metamorph'].forEach((key, index) => {
    cells[`Archetypes_Display!${String.fromCharCode(65 + index)}1`] = archetypeCatalogueFormula(key);
  });
  Object.assign(cells, {
    'Function_Tests!B4': '=COUNTIF(DATA_GET_COLUMN_BY_NAME("ClassFeatures","parentKey"),"heroic-combat-training")',
    'Function_Tests!B5': '=SUM(ARRAYFORMULA(COUNTIF(DATA_GET_COLUMN_BY_NAME("ClassFeatures","parentKey"),{"monster-evolution-or-collection","monster-evolution-or-collection-4","monster-evolution-or-collection-6","monster-evolution-or-collection-8","monster-evolution-or-collection-10"})))',
    'Function_Tests!B6': '=COUNTIF(DATA_GET_COLUMN_BY_NAME("Feats","parentKey"),"celestial-knight-path-initiate")',
    'Function_Tests!C22': '=COUNTIFS(\'_Feats\'!J2:J1000,"archetype",\'_Feats\'!B2:B1000,"<>OPTION",\'_Feats\'!C2:C1000,"<>",\'_Feats\'!D2:D1000,"<>",\'_Feats\'!N2:N1000,"<>")',
    'Function_Tests!F2': '=LET(category,\'_Feats\'!A2:A1000,keys,\'_Feats\'!C2:C1000,names,\'_Feats\'!D2:D1000,issues,MAP(category,keys,names,LAMBDA(cat,key,name,IF(cat="","",TEXTJOIN("; ",TRUE,IF(key="","Missing featKey",""),IF(name="","Missing name",""))))),IFNA(FILTER(HSTACK(MAP(category,LAMBDA(cat,"Feats")),ROW(\'_Feats\'!A2:A1000),keys,issues),issues<>""),{"","","",""}))',
  });
  const baseHeaders = ['traitKey', 'name', 'rank', 'prerequisites', 'tags', 'description', 'rankNotes', 'techniqueKeys'];
  const baseRow = ['fixture', 'Fixture', '1', '', 'Anatomy', 'Benefit', '', ''];
  const fixture = (headers, row) => `{${headers.map(quoted).join(',')};${row.map(quoted).join(',')}}`;
  const expected = '**Fixture - Rank 1**\n**Prerequisites:** None\n**Tags:** Anatomy\n\nBenefit';
  cells['Function_Tests!B41'] = `=N((${traitCatalogueFormula(fixture(baseHeaders, baseRow)).slice(1)})=${quoted(expected)})`;
  cells['Function_Tests!B42'] = `=N((${traitCatalogueFormula(fixture([...baseHeaders, 'selectionMode', 'duplicateGroup', 'reviewNotes'], [...baseRow, 'draft', 'family', 'Review'])).slice(1)})=${quoted(`${expected}\n*Possible duplicate: family*\n*Review*\n*Incomplete Trait*`)})`;
  cells['Function_Tests!B43'] = `=N(ISNA(${traitCatalogueFormula(fixture(baseHeaders, [...baseRow.slice(0, -1), 'missing-fixture-technique'])).slice(1)}))`;
  return {
    cells,
    values: {
      'Function_Tests!A4': 'Stable class option parent references',
      'Function_Tests!A5': 'Repeated Monster choices retain separate parent keys',
      'Function_Tests!A6': 'Stable feat option parent references',
      'Function_Tests!A14': 'Retired weapon-profile compatibility rows',
      'Function_Tests!A22': 'Archetype catalogue covers complete identities',
      'Function_Tests!F1': 'Source', 'Function_Tests!G1': 'Row', 'Function_Tests!H1': 'Key', 'Function_Tests!I1': 'Issue',
    },
    namedFunctions: DISPLAY_NAMED_FUNCTIONS,
  };
}
