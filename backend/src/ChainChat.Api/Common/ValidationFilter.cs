using FluentValidation;

namespace ChainChat.Api.Common;

/// <summary>
/// Endpoint filter that validates a request body with its FluentValidation validator before the handler runs.
/// Usage: <c>group.MapPost("/", Handler).AddEndpointFilter&lt;ValidationFilter&lt;MyRequest&gt;&gt;();</c>
/// </summary>
public sealed class ValidationFilter<T>(IValidator<T> validator) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var request = context.Arguments.OfType<T>().FirstOrDefault();
        if (request is null)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Request body is missing");
        }

        var result = await validator.ValidateAsync(request, context.HttpContext.RequestAborted);
        return result.IsValid ? await next(context) : TypedResults.ValidationProblem(result.ToDictionary());
    }
}
