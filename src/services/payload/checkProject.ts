import { InvocationContext } from "@azure/functions";

export function isValidProjectEstimatePayload(projectEstimate:any, context:InvocationContext):string[] {


    let errorFields = [];
    let mandatoryFields = new Set<string>([
        "name", "address", "county", "state", "zipCode", "percentages", "type"
    ])

    try {
        let projectEstimateJson = JSON.parse(projectEstimate);

        if ( projectEstimateJson || typeof projectEstimateJson === 'object' ) {
            mandatoryFields.forEach( ( field ) => {
                if ( !projectEstimateJson[field] || projectEstimateJson[field] === null || projectEstimateJson[field] === undefined ) {
                    errorFields.push(field);
                }
            });
        }

        return errorFields;
    } catch ( e ) {
        return [];
    }

}