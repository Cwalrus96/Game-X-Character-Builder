/** Human-readable source grants; authoring display only, never runtime execution. */
export function grantBlockFormula(expression = 'grants') {
  return `=IF(LEN(TEXTJOIN("",TRUE,${expression}))=0,"",LET(lines,TOCOL(SPLIT(TEXTJOIN(CHAR(10),TRUE,${expression}),CHAR(10)),1),"Grants: "&TEXTJOIN(CHAR(10),TRUE,MAP(lines,LAMBDA(line,LET(kind,LOWER(TRIM(INDEX(SPLIT(line,"|"),1,1))),field,LAMBDA(label,IFERROR(TRIM(REGEXEXTRACT(line,"(?:^|\\|)\\s*"&label&"=([^|]*)")),"")),count,IF(field("count")="","1",field("count")),counttext,PROPER(SUBSTITUTE(count,"-"," ")),rank,field("rank"),limit,IF(field("maxRank")="",""," up to Rank "&field("maxRank")),label,LAMBDA(sheet,keycol,key,LET(found,IFNA(DATA_GET_FIELD_BY_KEY(sheet,keycol,key,"name"),""),IF(found="","[Missing "&sheet&" key: "&key&"]",found))),refname,LAMBDA(key,LET(found,IFERROR(CHOICE_NAME(key),""),IF(found<>"",found,IFNA(DATA_GET_FIELD_BY_KEY("ClassFeatures","featureKey",key,"name"),IFNA(DATA_GET_FIELD_BY_KEY("Origins","originKey",key,"name"),IF(key="patron","Patron","[Missing choice: "&key&"]")))))),owner,IF(field("recipientRef")="",""," for "&refname(field("recipientRef"))),groupname,IF(field("groupKey")="","",label("ClassFeatures","featureKey",field("groupKey"))),techname,IF(field("techniqueKey")="",field("name"),LET(found,IFNA(DATA_GET_FIELD_BY_KEY("Techniques","techniqueKey",field("techniqueKey"),"techniqueName"),""),IF(found="","[Missing technique: "&field("techniqueKey")&"]",found))),"  * "&SWITCH(kind,
"feature","Apply "&label("ClassFeatures","featureKey",field("featureKey"))&" using the same conditional rules.",
"skill",IF(field("name")="","Choose "&count&" skill"&IF(count="1","","s"),field("name"))&IF(rank="",""," at Rank "&rank)&IF(field("minRank")="",""," in which you already have at least Rank "&field("minRank")&" training")&IF(field("progression")="",""," ("&PROPER(field("progression"))&" progression)")&owner,
"technique",IF(techname<>"","Learn "&techname,"Choose "&count&IF(field("skill")="",""," "&field("skill"))&" technique"&IF(count="1","","s"))&limit&owner,
"feat","Choose "&count&" "&field("type")&" feat"&IF(count="1","","s")&IF(field("category")="",""," ("&TEXTJOIN(" or ",TRUE,MAP(SPLIT(field("category")," OR ",FALSE,TRUE),LAMBDA(key,IF(key="multiclass","Multiclass",label("Classes","classKey",key)))))&")")&IF(field("maxLevel")="",""," of level "&field("maxLevel")&" or lower"),
"choice","Choose "&count&" "&field("type")&IF(count="1","","s")&owner,
"option","Choose "&count&" option"&IF(count="1","","s")&" from "&groupname,
"weapon","Choose "&count&IF(rank="",""," Rank "&rank)&IF(field("skill")="",""," "&field("skill"))&" weapon"&IF(count="1","","s")&IF(field("tag")="",""," with "&field("tag")&" tag")&IF(field("enhancement")="",""," ("&field("enhancement")&")")&IF(field("progression")="","","; rank follows "&field("progression")),
"weapon-enhancement","Choose "&count&IF(rank="",""," Rank "&rank)&" weapon enhancement"&IF(count="1","","s")&limit&IF(field("choiceRef")="",""," for "&refname(field("choiceRef"))),
"vehicle","Choose "&count&IF(rank="",""," Rank "&rank)&" vehicle"&IF(count="1","","s"),
"familiar","Choose "&count&IF(rank="",""," Rank "&rank)&" familiar"&IF(count="1","","s")&IF(field("rankFormula")="",""," (rank: "&SUBSTITUTE(field("rankFormula"),"-"," ")&")")&IF(field("sourceRef")="",""," from "&refname(field("sourceRef"))),
"resource","Gain "&IF(field("name")="",PROPER(SUBSTITUTE(field("resourceKey"),"-"," ")),field("name"))&" with capacity equal to "&counttext&IF(field("recharge")="","","; recharge: "&SUBSTITUTE(field("recharge"),"-"," ")),
"bond","Gain "&count&IF(rank="",""," Rank "&rank)&" bond"&IF(count="1","","s")&IF(field("choiceId")="",""," with "&refname(field("choiceId"))),
"specialization",IF(field("skill")="","Specialize "&refname(field("choiceRef")),field("skill")&" specialization: +"&field("bonus")&" for "&field("tag")&" techniques"),
"choice-rebind","Update "&refname(field("choiceRef"))&IF(rank="",""," to Rank "&rank)&IF(field("answerType")="",""," with "&count&" "&SUBSTITUTE(field("answerType"),"-"," ")&limit),
"tag","Gain the "&field("tag")&" tag"&IF(field("minRank")="",""," at Rank "&field("minRank")&" or higher")&owner,
"rank",SWITCH(field("operation"),"set","Set "&refname(field("choiceRef"))&" rank to "&field("value"),"increase","Increase "&refname(field("choiceRef"))&" rank by "&field("value"),"[Unrecognized rank operation: "&field("operation")&"]"),
"gadget",IF(REGEXMATCH(count,"^[0-9]+$"),"Choose "&count&" gadget"&IF(count="1","","s"),"Choose a number of gadgets equal to "&counttext),line)))))))`;
}

export function optionPrerequisiteFormula(expression = 'prerequisite_line') {
  return `LET(field,LAMBDA(label,IFERROR(TRIM(REGEXEXTRACT(${expression},"(?:^|\\|)\\s*"&label&"=([^|]*)")),"")),name,IFNA(DATA_GET_FIELD_BY_KEY("ClassFeatures","featureKey",field("groupKey"),"name"),"[Missing option group: "&field("groupKey")&"]"),"Know at least "&field("count")&" options from "&name)`;
}

export const GRANT_NAMED_FUNCTIONS = {
  GRANT_BLOCK:{argumentPlaceholders:['grants'],formula:grantBlockFormula()},
  PREREQ_LINE:{argumentPlaceholders:['prerequisite_line'],formula:`=LET(kind,LOWER(TRIM(INDEX(SPLIT(prerequisite_line,"|"),1,1))),SWITCH(kind,"class",PREREQ_CLASS(prerequisite_line),"familiar",PREREQ_FAMILIAR(prerequisite_line),"feat",PREREQ_FEAT(prerequisite_line),"choice",PREREQ_CHOICE(prerequisite_line),"option",${optionPrerequisiteFormula()},prerequisite_line))`},
};

/** Run these in native Sheets after installing the named functions. */
export const GRANT_NATIVE_FIXTURES = [
  {name:'Artifact owns its three Rank 1 skills',formula:'=GRANT_BLOCK("skill | choiceId=living-archive-skills | count=3 | rank=1 | recipientRef=artifact")',expected:'Grants:   * Choose 3 skills at Rank 1 for Artifact'},
  {name:'Repeated evolution resolves the canonical feature name',formula:'=GRANT_BLOCK("feature | featureKey=monster-evolution")',expected:'Grants:   * Apply Monster Evolution using the same conditional rules.'},
  {name:'Technique grant uses techniqueName from the compatibility table',formula:'=GRANT_BLOCK("technique | techniqueKey=explosive-transformation")',expected:'Grants:   * Learn Explosive Transformation'},
  {name:'Keystone uses the generic choice type',formula:'=GRANT_BLOCK("choice | type=keystone | count=1")',expected:'Grants:   * Choose 1 keystone'},
  {name:'Additional stance resolves the option group name',formula:'=GRANT_BLOCK("option | groupKey=stances | count=1")',expected:'Grants:   * Choose 1 option from Stances'},
  {name:'Known stance prerequisite retains minimum-count meaning',formula:'=PREREQ_LINE("option | groupKey=stances | count=2")',expected:'Know at least 2 options from Stances'},
  {name:'Trait tag threshold is retained',formula:'=GRANT_BLOCK("tag | tag=Flight | minRank=2")',expected:'Grants:   * Gain the Flight tag at Rank 2 or higher'},
  {name:'Rank set does not become an increase',formula:'=GRANT_BLOCK("rank | choiceRef=soulbound-weapon | operation=set | value=2")',expected:'Grants:   * Set Soulbound Weapon rank to 2'},
  {name:'Resource expressions are readable capacity rules',formula:'=GRANT_BLOCK("resource | resourceKey=charms | name=Charms | count=primary-attribute")',expected:'Grants:   * Gain Charms with capacity equal to Primary Attribute'},
  {name:'Existing-training filter is not a new training grant',formula:'=GRANT_BLOCK("skill | choiceId=trained-skill | minRank=1 | count=1")',expected:'Grants:   * Choose 1 skill in which you already have at least Rank 1 training'},
  {name:'Missing techniques remain explicit',formula:'=GRANT_BLOCK("technique | techniqueKey=missing-grant-fixture")',expected:'Grants:   * Learn [Missing technique: missing-grant-fixture]'},
];
