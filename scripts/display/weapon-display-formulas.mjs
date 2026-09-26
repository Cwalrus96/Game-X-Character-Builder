/** Handbook Weapons catalogue only; the complete WeaponBases import stays intact. */
const compact = formula => formula.replace(/\n\s*/g, '');

export const NATURAL_WEAPON_TAG_PATTERN = '(^|[,;\\n])\\s*Natural\\s*([,;\\n]|$)';

export function weaponCatalogueFilterFormula(keys = 'keys', tags = 'tags') {
  return `ARRAYFORMULA((${keys}<>"")*(${keys}<>"weaponKey")*NOT(REGEXMATCH(${tags}&"","(?i)${NATURAL_WEAPON_TAG_PATTERN}")))`;
}

export function weaponCatalogueFormula(source = "'WeaponBases'!A1:J1000") {
  return compact(`=LET(src,${source},head,INDEX(src,1,0),
    keys,CHOOSECOLS(src,XMATCH("weaponKey",head,0)),names,CHOOSECOLS(src,XMATCH("name",head,0)),
    ranks,CHOOSECOLS(src,XMATCH("minRank",head,0)),tags,CHOOSECOLS(src,XMATCH("tags",head,0)),
    descriptions,CHOOSECOLS(src,XMATCH("description",head,0)),refs,CHOOSECOLS(src,XMATCH("techniqueKeys",head,0)),
    traits,CHOOSECOLS(src,XMATCH("traitsText",head,0)),techkeys,'_TechniqueBlocks'!A1:A1000,techblocks,'_TechniqueBlocks'!C1:C1000,
    MAP(FILTER(keys,${weaponCatalogueFilterFormula()}),LAMBDA(key,
      LET(name,XLOOKUP(key,keys,names),rank,XLOOKUP(key,keys,ranks),tagtext,XLOOKUP(key,keys,tags),
        description,XLOOKUP(key,keys,descriptions),references,XLOOKUP(key,keys,refs),traittext,XLOOKUP(key,keys,traits),
        techniques,IF(references="","",TEXTJOIN(CHAR(10)&CHAR(10),TRUE,MAP(SPLIT(references,","),
          LAMBDA(techkey,XLOOKUP(TRIM(techkey),techkeys,techblocks))))),
        TEXTJOIN(CHAR(10),TRUE,"**"&name&" (Rank "&rank&")**","*Tags: "&IF(tagtext="","Not yet defined",tagtext)&"*",
          description,IF(traittext="","","**Traits:**"&CHAR(10)&traittext),
          IF(references="","*Techniques not yet defined.*","**Weapon techniques:**"&CHAR(10)&CHAR(10)&techniques))))))`);
}

export function weaponRankExcerptFormula(rank, {
  source = "'WeaponBases'!A1:J1000", cards = '$A$1:INDEX($A:$A,ROWS(allkeys))',
} = {}) {
  return compact(`=LET(src,${source},head,INDEX(src,1,0),keys,CHOOSECOLS(src,XMATCH("weaponKey",head,0)),
    ranks,CHOOSECOLS(src,XMATCH("minRank",head,0)),tags,CHOOSECOLS(src,XMATCH("tags",head,0)),
    populated,${weaponCatalogueFilterFormula()},allkeys,FILTER(keys,populated),allranks,FILTER(ranks,populated),
    FILTER(${cards},allranks=${rank}))`);
}

export function weaponDisplayNativeFixtures() {
  const source = '{"weaponKey","minRank","tags";"claw",0,"Natural; Sharp";"club",1,"Blunt";"web",1,"Web, natural";"stick",0,"";"unnatural",1,"Unnatural"}';
  const selection = `LET(src,${source},head,INDEX(src,1,0),keys,CHOOSECOLS(src,XMATCH("weaponKey",head,0)),tags,CHOOSECOLS(src,XMATCH("tags",head,0)),FILTER(keys,${weaponCatalogueFilterFormula()}))`;
  const excerpt = weaponRankExcerptFormula(1, {source, cards: '{"Club";"Stick";"Unnatural Blade"}'}).slice(1);
  return [
    {name: 'Weapons catalogue omits exact Natural tags while preserving other bases', formula: `=TEXTJOIN(",",TRUE,${selection})`, expected: 'club,stick,unnatural'},
    {name: 'Weapon rank excerpts retain card alignment after excluding Natural bases', formula: `=TEXTJOIN(",",TRUE,${excerpt})`, expected: 'Club,Unnatural Blade'},
  ];
}

export function buildWeaponDisplayFormulas() {
  const cells = {'WeaponBases_Display!A1': weaponCatalogueFormula()};
  cells['Function_Tests!C13'] = '=LET(source,DATA_IMPORT_SHEET("WeaponBases"),keys,CHOOSECOLS(source,XMATCH("weaponKey",INDEX(source,1,0),0)),SUM(ARRAYFORMULA(N((keys<>"")*(keys<>"weaponKey")))))';
  for (const [rank, column] of ['C', 'E', 'G', 'I', 'K', 'M'].entries()) {
    cells[`WeaponBases_Display!${column}1`] = weaponRankExcerptFormula(rank);
  }
  const source = `src,WeaponBases!A1:J1000,head,INDEX(src,1,0),keys,CHOOSECOLS(src,XMATCH("weaponKey",head,0)),tags,CHOOSECOLS(src,XMATCH("tags",head,0)),refs,CHOOSECOLS(src,XMATCH("techniqueKeys",head,0)),lists,FILTER(refs,${weaponCatalogueFilterFormula()})`;
  cells['Function_Tests!B29'] = `=LET(${source},cards,WeaponBases_Display!A1:INDEX(WeaponBases_Display!A:A,ROWS(lists)),SUM(MAP(lists,cards,LAMBDA(list,card,IF(list="",0,SUM(MAP(SPLIT(list,","),LAMBDA(key,N(ISNUMBER(FIND(XLOOKUP(TRIM(key),'_TechniqueBlocks'!A1:A1000,'_TechniqueBlocks'!C1:C1000),card)))))))))))`;
  cells['Function_Tests!C29'] = `=LET(${source},SUM(MAP(lists,LAMBDA(list,IF(list="",0,COUNTA(SPLIT(list,",")))))))`;
  const values = {};
  for (const [index, fixture] of weaponDisplayNativeFixtures().entries()) {
    const row = 60 + index;
    values[`Function_Tests!K${row}`] = fixture.name;
    cells[`Function_Tests!L${row}`] = fixture.formula;
    values[`Function_Tests!M${row}`] = fixture.expected;
    cells[`Function_Tests!N${row}`] = `=IF(L${row}=M${row},"PASS","FAIL")`;
  }
  return {cells, values};
}
