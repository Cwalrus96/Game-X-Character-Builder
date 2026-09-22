/** Native Google Sheets formulas for the authoring-only Technique display.
 *
 * The compatibility view preserves downstream column positions, not authoring
 * requirements. Only identity is required; omitted optional columns are arrays
 * with the same height as the imported table. Rendering resolves keys once and
 * reads every field from that row, including when display names are duplicated.
 */
const quote = value => String(value).split(/\r?\n/).map(line => `"${line.replaceAll('"', '""')}"`).join('&CHAR(10)&');
const compact = formula => formula.replace(/\n\s*/g, '');

export const TECHNIQUE_COMPATIBILITY_HEADERS = Object.freeze([
  'techniqueName', 'description', 'skill', 'rank', 'tags', 'prerequisites',
  'actionType', 'actions', 'trigger', 'energyCost', 'strainCost', 'sustained',
  'rollRequired', 'attribute', 'defense', 'range', 'targets', 'damage',
  'onSuccess', 'onCriticalSuccess', 'onFailure', 'onCriticalFailure', 'bondEffect',
  'notes', 'damageByRank', 'pumpDamageByRank', 'rankNotes', 'sourceNote',
  'techniqueKey', 'selectionMode', 'energyCostKind', 'energyCostOptions',
  'prerequisiteText', 'skillKeys', 'tagKeys', 'associatedSkill', 'basicAttack',
]);

const authoredField = {
  skill: 'selection', selectionMode: 'status', pumpDamageByRank: 'pumpingByRank',
};
const retired = new Set(['notes', 'damageByRank', 'sourceNote', 'prerequisiteText', 'skillKeys', 'tagKeys', 'selectionMode']);

const actionText = compact(`IF(OR(get("actionType")="",get("actions")=""),"Actions: Unassigned",
  IF(get("actions")="0","Free",get("actions"))&" "&SWITCH(get("actionType"),
    "ActionOrReaction","Action or Reaction","ActionOrFreeReaction","Action or Free Reaction",get("actionType")))`);
const energyText = compact(`SWITCH(get("energyCostKind"),
  "fixed",IF(get("energyCost")="","0 Energy",get("energyCost")&" Energy"),
  "variable","variable Energy","conditional",IF(get("energyCostOptions")="",IF(get("energyCost")="","0 Energy",get("energyCost")&" Energy"),
    TEXTJOIN(" or ",TRUE,MAP(SPLIT(get("energyCostOptions"),";",FALSE,TRUE),LAMBDA(option,
      IF(REGEXMATCH(TRIM(option),"^[^=]+=[0-9]+$"),
        REGEXEXTRACT(option,"[0-9]+$")&" Energy ("&SUBSTITUTE(REGEXEXTRACT(option,"^[^=]+"),"-"," ")&")",
        "[Unrecognized Energy option: "&option&"]"))))),IF(get("energyCost")="","0 Energy",get("energyCost")&" Energy"))`);
const costText = compact(`"( "&TEXTJOIN(" + ",TRUE,actiontext,energytext,
  IF(get("strainCost")="","",get("strainCost")&" Strain"))&
  IF(REGEXMATCH(UPPER(get("sustained")),"^(Y|YES|TRUE|1)$"),", Sustained","")&" )"`);
const rollSkill = compact(`IF(get("associatedSkill")<>"",get("associatedSkill"),
  IF(REGEXMATCH(LOWER(get("skill")),"^(granted$|tag=|weapontag=)"),"Associated skill",get("skill")))`);
const usageText = compact(`IF(UPPER(get("rollRequired"))="Y",TEXTJOIN(" ",TRUE,get("attribute"),
  IF(rollskill="","","("&rollskill&")"),IF(get("defense")="","","vs "&get("defense")&" Defense"))&".","")`);

/** The optional source expression makes the exact production adapter testable natively. */
export function techniqueCompatibilityFormula(source = 'DATA_IMPORT_SHEET("Techniques")') {
  const columns = TECHNIQUE_COMPATIBILITY_HEADERS.map(header => {
    const field = authoredField[header] ?? header;
    const values = retired.has(header) ? 'blank' : `column(${quote(field)})`;
    return `VSTACK(${quote(header)},${values})`;
  });
  return compact(`=LET(source,${source},head,INDEX(source,1,0),body,CHOOSEROWS(source,SEQUENCE(ROWS(source)-1,1,2)),
    blank,MAKEARRAY(ROWS(body),1,LAMBDA(rowindex,columnindex,"")),
    column,LAMBDA(field,LET(position,IFNA(XMATCH(field,head,0),0),
      IF(position=0,blank,CHOOSECOLS(body,MAX(1,position))))),
    HSTACK(${columns.join(',')}))`);
}

/** Generic effects are kept whole: equal multi-effect values may form a run. */
export function pumpingTextFormula(expression, { weaponRank = 'FALSE' } = {}) {
  return compact(`LET(pumptext,${expression},IF(pumptext="","",LET(
    entries,TRANSPOSE(SPLIT(pumptext,";",FALSE,TRUE)),
    valid,AND(MAP(entries,LAMBDA(item,REGEXMATCH(TRIM(item),"^[0-9]+\\s*=\\s*.+$")))),
    IF(NOT(valid),"Unrecognized pumping: "&pumptext,LET(
      ranks,MAP(entries,LAMBDA(item,VALUE(REGEXEXTRACT(TRIM(item),"^[0-9]+")))),
      effects,MAP(entries,LAMBDA(item,TRIM(REGEXREPLACE(item,"^[^=]*=","")))),
      normalized,MAP(effects,LAMBDA(effect,REGEXREPLACE(LOWER(REGEXREPLACE(TRIM(effect),"\\s+"," ")),"\\bwards\\b","ward"))),
      simple,AND(MAP(normalized,LAMBDA(effect,REGEXMATCH(effect,"^[+-]?[0-9]+ [a-z][a-z -]* per energy$")))),
      units,MAP(normalized,LAMBDA(effect,IFNA(REGEXEXTRACT(effect,"^[+-]?[0-9]+ ([a-z][a-z -]*) per energy$"),""))),
      sharedunit,AND(simple,COUNTUNIQUE(units)=1),
      groups,SCAN(0,SEQUENCE(ROWS(entries)),LAMBDA(previous,position,
        previous+IF(position=1,1,IF(AND(
          INDEX(normalized,position)=INDEX(normalized,MAX(1,position-1)),
          INDEX(ranks,position)=INDEX(ranks,MAX(1,position-1))+1),0,1)))),
      pieces,MAP(UNIQUE(groups),LAMBDA(groupid,LET(
        groupranks,FILTER(ranks,groups=groupid),
        effect,INDEX(FILTER(effects,groups=groupid),1),
        IF(sharedunit,REGEXEXTRACT(effect,"^[+-]?[0-9]+"),effect)&" at "&IF(${weaponRank},"weapon ","")&
          IF(ROWS(groupranks)=1,"rank "&MIN(groupranks),"ranks "&MIN(groupranks)&"–"&MAX(groupranks))))),
      IF(sharedunit,"Pump ("&IF(INDEX(units,1)="ward","wards",INDEX(units,1))&" per energy): ","Pumping: ")&TEXTJOIN("; ",TRUE,pieces)&"."
    )))))`);
}

/** Resolve a stable key before reading the display name; never reverse-lookup a name. */
function referenceNameFormula(source, keyHeader, nameHeader, keyExpression, kind) {
  return compact(`LET(referencekey,${keyExpression},reference,${source},
    referencehead,INDEX(reference,1,0),
    keyposition,IFNA(XMATCH(${quote(keyHeader)},referencehead,0),0),
    nameposition,IFNA(XMATCH(${quote(nameHeader)},referencehead,0),0),
    IF(OR(keyposition=0,nameposition=0),"[Missing ${kind} reference columns: "&referencekey&"]",
      LET(referencekeys,CHOOSECOLS(reference,MAX(1,keyposition)),
        matches,SUM(ARRAYFORMULA(N(referencekeys=referencekey))),
        IF(matches<>1,"[Unresolved ${kind} key: "&referencekey&"]",
          INDEX(reference,XMATCH(referencekey,referencekeys,0),MAX(1,nameposition))))))`);
}

/** Human wording for the formal prerequisite DSL, with visible unknown clauses.
 * Tables are injectable so fixtures run without importing or changing source.
 */
export function prerequisiteTextFormula(expression, {
  techniques = "'_Techniques'!A1:AK1000",
  traits = 'Traits!A1:L1000',
  weapons = 'WeaponBases!A1:J1000',
  feats = "'_Feats'!A1:Q1000",
  classes = "'_Classes'!A1:M1000",
  archetypes = "'_ArchetypeFeats'!A1:F1000",
} = {}) {
  const reference = (src, keyHeader, nameHeader, key, kind) => referenceNameFormula(src, keyHeader, nameHeader, key, kind);
  const weaponName = reference(weapons, 'weaponKey', 'name', 'field("key")', 'weapon');
  const techniqueName = reference(techniques, 'techniqueKey', 'techniqueName', 'IF(field("key")<>"",field("key"),field("techniqueKey"))', 'technique');
  const traitName = reference(traits, 'traitKey', 'name', 'IF(field("traitKey")<>"",field("traitKey"),field("key"))', 'Trait');
  const featName = reference(feats, 'featKey', 'name', 'IF(field("key")<>"",field("key"),field("featKey"))', 'feat');
  const className = reference(classes, 'classKey', 'name', 'IF(field("classKey")<>"",field("classKey"),field("key"))', 'class');
  // Archetype membership repeats its key; the distinct key/name pair defines identity.
  const archetypeName = reference(`UNIQUE(CHOOSECOLS(${archetypes},2,3))`, 'archetypeKey', 'archetypeName', 'IF(field("key")<>"",field("key"),IF(field("archetypeKey")<>"",field("archetypeKey"),TRIM(INDEX(parts,1,2))))', 'archetype');
  return compact(`LET(prerequisitetext,${expression},IF(prerequisitetext="","",TEXTJOIN("; ",TRUE,
    MAP(TRANSPOSE(SPLIT(prerequisitetext,CHAR(10),FALSE,TRUE)),LAMBDA(prerequisiteline,
      TEXTJOIN(" or ",TRUE,MAP(TRANSPOSE(SPLIT(REGEXREPLACE(prerequisiteline,
        "(?i)\\s+OR\\s+([a-z-]+\\s*\\|)",CHAR(9830)&"$1"),CHAR(9830),FALSE,TRUE)),LAMBDA(rawline,LET(
      line,TRIM(rawline),parts,SPLIT(line,"|",FALSE,TRUE),kind,LOWER(TRIM(INDEX(parts,1,1))),
      field,LAMBDA(fieldname,IFNA(TRIM(REGEXEXTRACT(line,"(?:^|\\|)\\s*"&fieldname&"=([^|]*)")),"")),
      words,LAMBDA(value,SUBSTITUTE(TRIM(value),"_"," ")),
      taglist,LAMBDA(value,separator,TEXTJOIN(separator,TRUE,MAP(SPLIT(value,",",FALSE,TRUE),LAMBDA(tag,words(tag))))),
      detail,SWITCH(kind,
        "weapon",TEXTJOIN(" ",TRUE,
          IF(field("wielded")="true","Wielding",""),
          IF(field("key")="","",${weaponName}),
          IF(field("tagAll")="","",taglist(field("tagAll")," and ")),
          IF(field("tag")="","",words(field("tag"))),
          IF(field("tagAny")="","","("&taglist(field("tagAny")," or ")&")"),
          IF(field("key")="","weapon",""),
          IF(field("tagNot")="","","without "&taglist(field("tagNot")," or ")&" tag"),
          IF(field("minReach")="","","with Reach "&field("minReach")&"+")),
        "weapon-set",TEXTJOIN(" ",TRUE,IF(field("wielded")="true","Wielding",""),
          field("count"),IF(field("key")="","",${weaponName}),IF(field("tagAll")="","",taglist(field("tagAll")," and ")),
          words(field("tag")),IF(field("tagAny")="","","("&taglist(field("tagAny")," or ")&")"),
          "weapons",IF(field("tagNot")="","","without "&taglist(field("tagNot")," or ")&" tag"),
          IF(field("minReach")="","","with Reach "&field("minReach")&"+"),
          IF(field("separateHands")="true","one in each hand","")),
        "tag",TEXTJOIN(" ",TRUE,"Character has",words(field("tag")),
          IF(field("tagAll")="","",taglist(field("tagAll")," and ")),
          IF(field("tagAny")="","","("&taglist(field("tagAny")," or ")&")"),"tag",
          IF(field("tagNot")="","","and lacks "&taglist(field("tagNot")," or ")&" tag")),
        "technique",IF(AND(field("key")="",field("techniqueKey")=""),"[Unresolved technique reference: "&line&"]",${techniqueName}),
        "trait",${traitName}&IF(field("minRank")="",""," (Rank "&field("minRank")&"+)"),
        "feat",${featName},
        "class",${className}&IF(field("level")="",""," level "&field("level")&"+"),
        "skill",IF(field("name")="","[Unresolved skill requirement: "&line&"]",field("name")&IF(field("minRank")="",""," Rank "&field("minRank")&"+")),
        "archetype",field("numFeats")&" previous "&${archetypeName}&" feats",
        "text",field("text"),
        "[Unrecognized prerequisite: "&line&"]"),
      allowed,SWITCH(kind,"weapon","key|tag|tagAll|tagAny|tagNot|minReach|wielded",
        "weapon-set","count|key|tag|tagAll|tagAny|tagNot|minReach|wielded|separateHands",
        "tag","tag|tagAll|tagAny|tagNot","technique","key|techniqueKey",
        "trait","traitKey|key|minRank","feat","key|featKey","class","classKey|key|level",
        "skill","name|minRank","archetype","key|archetypeKey|numFeats","text","text",""),
      unknown,IF(COLUMNS(parts)<2,"",TEXTJOIN("; ",TRUE,MAP(CHOOSECOLS(parts,SEQUENCE(1,COLUMNS(parts)-1,2)),LAMBDA(part,
        IF(OR(AND(kind="archetype",NOT(REGEXMATCH(part,"="))),REGEXMATCH(TRIM(part),"^("&allowed&")=")),"",TRIM(part)))))),
      detail&IF(unknown="",""," [Additional requirement: "&unknown&"]")
    )))))))))`);
}

/** A wrapper references the underlying basic attack; modifiers apply to that roll. */
export function basicAttackTextFormula(expression, {techniques = "'_Techniques'!A1:AK1000"} = {}) {
  const techniqueName = referenceNameFormula(techniques, 'techniqueKey', 'techniqueName', 'field("techniqueKey")', 'basic attack');
  return compact(`LET(attacktext,${expression},IF(attacktext="","",TEXTJOIN(" or ",TRUE,
    MAP(TRANSPOSE(SPLIT(attacktext," OR ",FALSE,TRUE)),LAMBDA(rawattack,LET(
      line,TRIM(rawattack),parts,SPLIT(line,"|",FALSE,TRUE),kind,LOWER(TRIM(INDEX(parts,1,1))),
      field,LAMBDA(fieldname,IFNA(TRIM(REGEXEXTRACT(line,"(?:^|\\|)\\s*"&fieldname&"=([^|]*)")),"")),
      label,SWITCH(kind,"weapon","Weapon basic attack","technique",${techniqueName},"[Unrecognized basic attack: "&line&"]"),
      modifiers,TEXTJOIN("; ",TRUE,IF(field("attribute")="","","attribute: "&field("attribute")),IF(field("defense")="","","vs "&field("defense")&" Defense")),
      allowed,IF(kind="weapon","attribute|defense","techniqueKey|attribute|defense"),
      unknown,IF(COLUMNS(parts)<2,"",TEXTJOIN("; ",TRUE,MAP(CHOOSECOLS(parts,SEQUENCE(1,COLUMNS(parts)-1,2)),LAMBDA(part,IF(REGEXMATCH(TRIM(part),"^("&allowed&")="),"",TRIM(part)))))),
      label&IF(modifiers="",""," ("&modifiers&")")&IF(unknown="",""," [Additional basic-attack requirement: "&unknown&"]")
    ))))))`);
}

export function techniqueBlocksFormula({
  source = "'_Techniques'!A1:AK1000",
  keys = "FILTER('_Techniques'!AC2:AC1000,'_Techniques'!AC2:AC1000<>\"\")",
  weaponKeys = "'_TechniqueBlocks'!A1:A1000",
  weaponOwners = "'_TechniqueBlocks'!B1:B1000",
  prerequisiteSources = {},
} = {}) {
  const prerequisites = prerequisiteTextFormula('get("prerequisites")', { techniques: 'source', ...prerequisiteSources });
  const basicAttack = basicAttackTextFormula('get("basicAttack")', {techniques: 'source'});
  const pumping = pumpingTextFormula('get("pumpDamageByRank")', { weaponRank: 'provider<>""' });
  return compact(`=LET(source,${source},head,INDEX(source,1,0),
    keyposition,IFNA(XMATCH("techniqueKey",head,0),0),
    IF(keyposition=0,"[Missing required techniqueKey column]",LET(
      sourcekeys,CHOOSECOLS(source,MAX(1,keyposition)),
      MAP(${keys},LAMBDA(key,LET(matches,SUM(ARRAYFORMULA(N(sourcekeys=key))),
        IF(matches<>1,"[Unresolved technique key: "&key&"]",LET(
          record,CHOOSEROWS(source,XMATCH(key,sourcekeys,0)),
          get,LAMBDA(field,LET(position,IFNA(XMATCH(field,head,0),0),
            IF(position=0,"",TO_TEXT(INDEX(record,1,MAX(1,position)))))),
          name,get("techniqueName"),rank,get("rank"),selection,get("skill"),
          associated,get("associatedSkill"),status,get("selectionMode"),
          actiontype,get("actionType"),actions,get("actions"),
          costkind,get("energyCostKind"),energy,get("energyCost"),
          provider,IFNA(XLOOKUP(key,${weaponKeys},${weaponOwners}),""),
          access,IF(selection="","Unassigned",IF(LOWER(selection)="granted","Granted",
            IF(LOWER(LEFT(selection,10))="weapontag=","Weapon with "&MID(selection,11,LEN(selection))&" tag",
              IF(LOWER(LEFT(selection,4))="tag=",MID(selection,5,LEN(selection))&" tag",selection)))),
          rollskill,${rollSkill},
          pretext,${prerequisites},
          usage,${usageText},actiontext,${actionText},energytext,${energyText},
          incomplete,OR(name="",rank="",selection="",actiontype="",actions=""),
          cost,${costText},
          TEXTJOIN(CHAR(10),TRUE,
            IF(name="","[Missing technique name: "&key&"]","**"&name&" ( Rank "&IF(rank="","TBD",rank)&")**"),
            "*Access: "&access&"*",IF(incomplete,"Incomplete technique",""),
            IF(pretext="","","Prerequisites: "&pretext),IF(get("tags")="","","Tags: "&get("tags")),
            usage,IF(get("basicAttack")="","","Basic attack: "&${basicAttack}),cost,IF(get("trigger")="","","Reaction Trigger: "&get("trigger")),
            TEXTJOIN(", ",TRUE,get("range"),get("targets")),get("description"),
            IF(get("damage")="","","Damage: "&get("damage")),
            IF(get("onSuccess")="","","Success: "&get("onSuccess")),
            IF(get("onCriticalSuccess")="","","Critical Success: "&get("onCriticalSuccess")),
            IF(get("onFailure")="","","Failure: "&get("onFailure")),
            IF(get("onCriticalFailure")="","","Critical Failure: "&get("onCriticalFailure")),
            IF(get("bondEffect")="","","Bond Effect: "&get("bondEffect")),
            ${pumping},get("rankNotes"))
        )))))
    )))`);
}

/** Existing named-function signatures remain unchanged; their `name` argument
 * now consistently carries a technique key. The main pool is independent of
 * these compatibility wrappers, so TECHNIQUE_BLOCK has no circular dependency.
 */
export function techniqueNamedFunctionPatches() {
  const get = 'get,LAMBDA(field,TECHNIQUE_GET_FIELD(name,field))';
  const blockLines = 'block,TECHNIQUE_BLOCK(name),lines,TRANSPOSE(SPLIT(block,CHAR(10),FALSE,TRUE))';
  const extract = pattern => `IFNA(TEXTJOIN(CHAR(10),TRUE,FILTER(lines,ARRAYFORMULA(REGEXMATCH(lines,${quote(pattern)})))),"")`;
  const metadataLines = extract('^(Prerequisites: |Tags: )');
  const costLine = 'IFNA(INDEX(FILTER(lines,ARRAYFORMULA(REGEXMATCH(lines,"^\\( "))),1),"")';
  const pumpingLines = extract('^(Pump \\(|Pumping: |Unrecognized pumping: )');
  return {
    TECHNIQUE_GET_FIELD: compact(`=LET(source,'_Techniques'!A1:AK1000,head,INDEX(source,1,0),
      keys,CHOOSECOLS(source,XMATCH("techniqueKey",head,0)),matches,SUM(ARRAYFORMULA(N(keys=name))),
      position,IFNA(XMATCH(column,head,0),0),
      IF(matches<>1,"[Unresolved technique key: "&name&"]",IF(position=0,"",
        TO_TEXT(INDEX(source,XMATCH(name,keys,0),MAX(1,position))))))`),
    TECHNIQUE_BLOCK: '=IF(COUNTIF(\'_TechniqueBlocks\'!A1:A1000,name)<>1,"[Unresolved technique key: "&name&"]",XLOOKUP(name,\'_TechniqueBlocks\'!A1:A1000,\'_TechniqueBlocks\'!C1:C1000))',
    TECHNIQUE_USAGE_LINE: `=LET(${get},rollskill,${rollSkill},${usageText})`,
    TECHNIQUE_COST_LINE: `=LET(${blockLines},trigger,TECHNIQUE_GET_FIELD(name,"trigger"),IF(LEFT(block,26)="[Unresolved technique key:",block,TEXTJOIN(CHAR(10),TRUE,${costLine},IF(trigger="","","Reaction Trigger: "&trigger))))`,
    TECHNIQUE_METADATA_BLOCK: `=LET(${blockLines},IF(LEFT(block,26)="[Unresolved technique key:",block,${metadataLines}))`,
    TECHNIQUE_CANTRIP_BLOCK: `=LET(${blockLines},IF(LEFT(block,26)="[Unresolved technique key:",block,TEXTJOIN(CHAR(10),TRUE,IF(TECHNIQUE_GET_FIELD(name,"pumpDamageByRank")="","",${pumpingLines}),TECHNIQUE_GET_FIELD(name,"rankNotes"))))`,
    TECHNIQUE_BLOCKS_BY_SKILL: '=MAP(SORT(FILTER(DATA_GET_COLUMN_BY_NAME("Techniques","techniqueKey"),DATA_GET_COLUMN_BY_NAME("Techniques","skill")=skill),FILTER(DATA_GET_COLUMN_BY_NAME("Techniques","rank"),DATA_GET_COLUMN_BY_NAME("Techniques","skill")=skill),TRUE),TECHNIQUE_BLOCK)',
    TECHNIQUES_CATALOGUE: '=MAP(TRANSPOSE(UNIQUE(DATA_GET_COLUMN_BY_NAME_NONBLANK("Techniques","skill"))),TECHNIQUE_BLOCKS_BY_SKILL)',
  };
}

const literalTable = rows => `{${rows.map(row => row.map(quote).join(',')).join(';')}}`;

/** Install these formulas in native Sheets; Node tests do not evaluate Sheets. */
export function techniqueNativeFixtures() {
  const headers = ['techniqueKey', 'techniqueName', 'selection', 'rank', 'energyCostKind', 'energyCost', 'actionType', 'actions', 'description'];
  const minimal = literalTable([headers, ['fixture-a', 'Same Name', 'Spellcasting', '1', 'fixed', '0', 'Action', '1', 'First benefit'], ['fixture-b', 'Same Name', 'Martial Arts', '2', 'fixed', '3', 'Reaction', '0', 'Second benefit']]);
  const compat = techniqueCompatibilityFormula(minimal).slice(1);
  const render = keys => techniqueBlocksFormula({ source: compat, keys, weaponKeys: '{""}', weaponOwners: '{""}' }).slice(1);
  const renderRows = (rows, keys) => techniqueBlocksFormula({ source: techniqueCompatibilityFormula(literalTable(rows)).slice(1), keys, weaponKeys: '{""}', weaponOwners: '{""}' });
  return [
    { name: 'Technique optional headers produce full blank columns', formula: `=AND(ROWS(${compat})=3,COLUMNS(${compat})=37,INDEX(${compat},2,24)="",INDEX(${compat},3,36)="",INDEX(${compat},3,37)="")`, expected: true },
    { name: 'Technique duplicate display names resolve by key', formula: `=INDEX(${render('{"fixture-b";"fixture-a"}')},1,1)`, expected: '**Same Name ( Rank 2)**\n*Access: Martial Arts*\n( Free Reaction + 3 Energy )\nSecond benefit' },
    { name: 'Technique missing reference remains local', formula: `=INDEX(${render('{"missing";"fixture-a"}')},1,1)`, expected: '[Unresolved technique key: missing]' },
    { name: 'Technique valid neighbor survives missing reference', formula: `=INDEX(${render('{"missing";"fixture-a"}')},2,1)`, expected: '**Same Name ( Rank 1)**\n*Access: Spellcasting*\n( 1 Action + 0 Energy )\nFirst benefit' },
    { name: 'Pumping groups only adjacent equal effects and keeps gaps', formula: `=${pumpingTextFormula(quote('0=+0 damage per Energy;1=+1 healing per Energy;2=+1 healing per Energy;4=+1 healing per Energy;5=+1 ward per Energy;6=+1 healing per Energy'))}`, expected: 'Pumping: +0 damage per Energy at rank 0; +1 healing per Energy at ranks 1–2; +1 healing per Energy at rank 4; +1 ward per Energy at rank 5; +1 healing per Energy at rank 6.' },
    { name: 'Pumping retains simultaneous effects', formula: `=${pumpingTextFormula(quote('1=+1 healing and +2 wards per Energy;2=+1 healing and +2 wards per Energy'))}`, expected: 'Pumping: +1 healing and +2 wards per Energy at ranks 1–2.' },
    { name: 'Weapon prerequisite keeps alternatives exclusions and reach', formula: `=${prerequisiteTextFormula(quote('weapon | tag=Sharp | tagAny=Ranged,Thrown | tagNot=Defensive | minReach=1 | wielded=true'))}`, expected: 'Wielding Sharp (Ranged or Thrown) weapon without Defensive tag with Reach 1+' },
    { name: 'Prerequisite character tag and weapon tag remain distinct', formula: `=${prerequisiteTextFormula(quote('tag | tag=Wing\nweapon | tag=Wing'))}`, expected: 'Character has Wing tag; Wing weapon' },
    { name: 'Prerequisite missing reference is explicit', formula: `=${prerequisiteTextFormula(quote('trait | traitKey=missing'), { traits: '{"traitKey","name";"present","Present"}' })}`, expected: '[Unresolved Trait key: missing]' },
    { name: 'Unknown prerequisite qualifier is preserved', formula: `=${prerequisiteTextFormula(quote('weapon | tag=Sharp | futureRule=3'))}`, expected: 'Sharp weapon [Additional requirement: futureRule=3]' },
    { name: 'Healing pumping uses healing units', formula: `=${pumpingTextFormula(quote('1=+1 healing per Energy;2=+1 healing per Energy;4=+2 healing per Energy'))}`, expected: 'Pump (healing per energy): +1 at ranks 1–2; +2 at rank 4.' },
    { name: 'Duplicate stable technique keys are diagnosed', formula: renderRows([headers, ['duplicate', 'One', '', '', '', '', '', '', ''], ['duplicate', 'Two', '', '', '', '', '', '', '']], '{"duplicate"}'), expected: '[Unresolved technique key: duplicate]' },
    { name: 'Blank cost defaults to zero while missing required rank remains unknown', formula: renderRows([headers, ['unknown', 'Unfinished', '', '', '', '', '', '', 'Known benefit']], '{"unknown"}'), expected: '**Unfinished ( Rank TBD)**\n*Access: Unassigned*\nIncomplete technique\n( Actions: Unassigned + 0 Energy )\nKnown benefit' },
    { name: 'Weapon selection inherits skill and preserves strain critical failure', formula: renderRows([
      [...headers, 'rollRequired', 'attribute', 'defense', 'strainCost', 'onCriticalFailure'],
      ['web', 'Web', 'weaponTag=Web', '1', 'fixed', '2', 'Action', '1', 'Known benefit', 'Y', 'Agility', 'Physical', '1', 'Lose your grip'],
    ], '{"web"}'), expected: '**Web ( Rank 1)**\n*Access: Weapon with Web tag*\nAgility (Associated skill) vs Physical Defense.\n( 1 Action + 2 Energy + 1 Strain )\nKnown benefit\nCritical Failure: Lose your grip' },
    { name: 'Authored text prerequisite preserves its wording', formula: `=${prerequisiteTextFormula(quote('text | text=Beam'))}`, expected: 'Beam' },
    { name: 'Weapon-set prerequisite preserves separate hands', formula: `=${prerequisiteTextFormula(quote('weapon-set | count=2 | tag=Melee | wielded=true | separateHands=true'))}`, expected: 'Wielding 2 Melee weapons one in each hand' },
  ];
}

/** Decision follow-up fixtures occupy their own manifest range after the older suites. */
export function techniqueDecisionNativeFixtures() {
  const references = literalTable([
    ['techniqueKey', 'techniqueName'], ['unarmed-strike', 'Unarmed Strike'], ['pistol-basic-attack', 'Pistol Basic Attack'],
  ]);
  const attack = value => `=${basicAttackTextFormula(quote(value), {techniques: references})}`;
  const render = record => techniqueBlocksFormula({
    source: techniqueCompatibilityFormula(literalTable([
      ['techniqueKey', 'techniqueName', 'selection', 'rank', 'energyCostKind', 'energyCost', 'actionType', 'actions', 'description', 'rollRequired', 'basicAttack'],
      ['fixture', 'Fixture', 'Martial Arts', '1', 'fixed', '3', record.actionType ?? 'Action', '1', 'Benefit', 'N', record.basicAttack ?? ''],
    ])).slice(1), keys: '{"fixture"}', weaponKeys: '{""}', weaponOwners: '{""}',
  });
  return [
    {name: 'Basic attack resolves a stable technique key to its name', formula: attack('technique | techniqueKey=pistol-basic-attack'), expected: 'Pistol Basic Attack'},
    {name: 'Basic attack keeps weapon and unarmed alternatives', formula: attack('weapon OR technique | techniqueKey=unarmed-strike'), expected: 'Weapon basic attack or Unarmed Strike'},
    {name: 'Basic attack preserves underlying attribute and defense overrides', formula: attack('technique | techniqueKey=unarmed-strike | attribute=Agility | defense=Spiritual'), expected: 'Unarmed Strike (attribute: Agility; vs Spiritual Defense)'},
    {name: 'Missing basic attack reference is explicit', formula: attack('technique | techniqueKey=missing'), expected: '[Unresolved basic attack key: missing]'},
    {name: 'Unknown basic attack modifier is not dropped', formula: attack('weapon | futureRule=3'), expected: 'Weapon basic attack [Additional basic-attack requirement: futureRule=3]'},
    {name: 'Wrapper renders its basic attack without an independent roll', formula: render({basicAttack: 'weapon | defense=Spiritual'}), expected: '**Fixture ( Rank 1)**\n*Access: Martial Arts*\nBasic attack: Weapon basic attack (vs Spiritual Defense)\n( 1 Action + 3 Energy )\nBenefit'},
    {name: 'Action and free triggered Reaction retain distinct costs', formula: render({actionType: 'ActionOrFreeReaction'}), expected: '**Fixture ( Rank 1)**\n*Access: Martial Arts*\n( 1 Action or Free Reaction + 3 Energy )\nBenefit'},
    {name: 'Typed prerequisite OR supports an unarmed Martial Arts route', formula: `=${prerequisiteTextFormula(quote('weapon | tag=Melee | wielded=true OR skill | name=Martial Arts | minRank=1'))}`, expected: 'Wielding Melee weapon or Martial Arts Rank 1+'},
    {name: 'Prerequisite value OR stays inside its original clause', formula: `=${prerequisiteTextFormula(quote('weapon | tag=Heavy OR Two-handed'))}`, expected: 'Heavy OR Two-handed weapon'},
  ];
}
